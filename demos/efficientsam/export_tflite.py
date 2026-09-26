#!/usr/bin/env python3
"""Export EfficientSAM-Ti (https://github.com/yformer/EfficientSAM) to LiteRT (.tflite).

Exports two static-shape float32 LiteRT models for in-browser execution (<= 4D tensors
only, for full compatibility with LiteRT WebGPU and XNNPACK WASM delegates):
  1. models/efficientsam_ti_encoder.tflite
     - Input:  image [1, 3, IMG_SIZE, IMG_SIZE] (float32, RGB in [0, 1])
     - Output: image_embeddings [1, 256, H_emb, W_emb] (float32)
  2. models/efficientsam_ti_decoder.tflite
     - Inputs:
         image_embeddings [1, 256, H_emb, W_emb] (float32)
         points           [1, 6, 2] (float32, pixel coords in [0, IMG_SIZE])
         labels           [1, 6]    (float32: 1=FG, 0=BG, 2=BoxTL, 3=BoxBR, -1=Pad)
     - Outputs:
         masks            [1, 3, H_mask, W_mask] (float32 mask logits)
         iou_predictions  [1, 3]                  (float32 predicted IoU scores)
"""

import argparse
import math
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image
import torch
import torch.nn as nn
import torch.nn.functional as F


WEIGHTS_URL = (
    "https://github.com/yformer/EfficientSAM/raw/main/weights/efficient_sam_vitt.pt"
)


class ExportFriendlyAttention(nn.Module):
    """4D-only Attention wrapper replacing EfficientSAM's 5D QKV reshape/permute."""

    def __init__(self, orig_attn: nn.Module):
        super().__init__()
        self.num_heads = orig_attn.num_heads
        self.scale = orig_attn.scale
        self.qkv = orig_attn.qkv
        self.proj = orig_attn.proj

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        b, n, c = x.shape
        head_dim = c // self.num_heads
        qkv = self.qkv(x)
        q, k, v = torch.chunk(qkv, 3, dim=-1)
        q = q.reshape(b, n, self.num_heads, head_dim).permute(0, 2, 1, 3)
        k = k.reshape(b, n, self.num_heads, head_dim).permute(0, 2, 1, 3)
        v = v.reshape(b, n, self.num_heads, head_dim).permute(0, 2, 1, 3)

        attn = (q @ k.transpose(-2, -1)) * self.scale
        attn = attn.softmax(dim=-1)
        x = (attn @ v).transpose(1, 2).reshape(b, n, c)
        x = self.proj(x)
        return x


class ExportFriendlyEncoder(nn.Module):
    """Static-shape 4D-only wrapper around EfficientSAM ImageEncoderViT."""

    def __init__(self, sam_model: nn.Module, img_size: int = 512):
        super().__init__()
        self.img_size = img_size
        encoder = sam_model.image_encoder
        self.patch_embed = encoder.patch_embed
        self.blocks = encoder.blocks
        for blk in self.blocks:
            blk.attn = ExportFriendlyAttention(blk.attn)
        self.neck = encoder.neck

        self.register_buffer(
            "pixel_mean",
            torch.tensor([0.485, 0.456, 0.406], dtype=torch.float32).view(1, 3, 1, 1),
        )
        self.register_buffer(
            "pixel_std",
            torch.tensor([0.229, 0.224, 0.225], dtype=torch.float32).view(1, 3, 1, 1),
        )

        # Pre-interpolate positional embeddings with bicubic mode once at export time
        # so the exported LiteRT graph has no ResizeBicubic operator.
        patch_size = 16
        grid_size = img_size // patch_size
        with torch.no_grad():
            abs_pos = encoder.pos_embed[:, 1:]
            xy_num = abs_pos.shape[1]
            orig_size = int(math.sqrt(xy_num))
            abs_pos_2d = F.interpolate(
                abs_pos.reshape(1, orig_size, orig_size, -1).permute(0, 3, 1, 2),
                size=(grid_size, grid_size),
                mode="bicubic",
                align_corners=False,
            ).permute(0, 2, 3, 1)
        self.register_buffer("pos_embed_2d", abs_pos_2d.contiguous())
        self.grid_size = grid_size

    def forward(self, image: torch.Tensor) -> torch.Tensor:
        x = (image - self.pixel_mean) / self.pixel_std
        x = self.patch_embed(x)
        x = x.permute(0, 2, 3, 1) + self.pos_embed_2d
        b, h, w, c = x.shape
        x = x.reshape(b, h * w, c)
        for blk in self.blocks:
            x = blk(x)
        x = x.reshape(b, h, w, c).permute(0, 3, 1, 2)
        x = self.neck(x)
        return x


class ExportFriendlyDecoder(nn.Module):
    """Static-shape 4D-only float32 wrapper around EfficientSAM PromptEncoder + MaskDecoder."""

    def __init__(self, sam_model: nn.Module, img_size: int = 512, max_pts: int = 6):
        super().__init__()
        self.img_size = float(img_size)
        self.max_pts = max_pts
        self.grid_size = img_size // 16

        pe = sam_model.prompt_encoder
        self.register_buffer(
            "gaussian_matrix",
            pe.pe_layer.positional_encoding_gaussian_matrix.detach().clone(),
        )
        self.RegisterPromptWeights(pe)

        with torch.no_grad():
            dense_pe = self._compute_dense_pe(self.grid_size, self.grid_size)
        self.register_buffer("dense_pe", dense_pe)

        self.mask_decoder = sam_model.mask_decoder

    def RegisterPromptWeights(self, pe: nn.Module):
        self.register_buffer(
            "invalid_point_weight", pe.invalid_points.weight.detach().clone()
        )
        self.register_buffer(
            "fg_point_weight", pe.point_embeddings.weight.detach().clone()
        )
        self.register_buffer(
            "tl_box_weight", pe.bbox_top_left_embeddings.weight.detach().clone()
        )
        self.register_buffer(
            "br_box_weight", pe.bbox_bottom_right_embeddings.weight.detach().clone()
        )

    def _pe_encoding(self, coords: torch.Tensor) -> torch.Tensor:
        coords = 2.0 * coords - 1.0
        coords = coords @ self.gaussian_matrix
        coords = (2.0 * math.pi) * coords
        return torch.cat([torch.sin(coords), torch.cos(coords)], dim=-1)

    def _compute_dense_pe(self, h: int, w: int) -> torch.Tensor:
        grid = torch.ones((h, w), dtype=torch.float32)
        y_embed = (grid.cumsum(dim=0) - 0.5) / float(h)
        x_embed = (grid.cumsum(dim=1) - 0.5) / float(w)
        pe = self._pe_encoding(torch.stack([x_embed, y_embed], dim=-1))
        return pe.permute(2, 0, 1).unsqueeze(0).contiguous()

    def forward(
        self,
        image_embeddings: torch.Tensor,
        points: torch.Tensor,
        labels: torch.Tensor,
    ):
        # points: [1, max_pts, 2] in [0, img_size]
        # labels: [1, max_pts] float32: 1.0=FG, 0.0=BG, 2.0=BoxTL, 3.0=BoxBR, -1.0=Pad
        coords = (points + 0.5) / self.img_size
        point_embedding = self._pe_encoding(coords)

        # Pure float32 triangular hat indicators (avoids BOOL / CAST ops on GPU delegates)
        is_invalid = F.relu(1.0 - torch.abs(labels - (-1.0))).unsqueeze(-1)
        is_fg = F.relu(1.0 - torch.abs(labels - 1.0)).unsqueeze(-1)
        is_tl = F.relu(1.0 - torch.abs(labels - 2.0)).unsqueeze(-1)
        is_br = F.relu(1.0 - torch.abs(labels - 3.0)).unsqueeze(-1)

        point_embedding = (
            point_embedding
            + is_invalid * self.invalid_point_weight.unsqueeze(1)
            + is_fg * self.fg_point_weight.unsqueeze(1)
            + is_tl * self.tl_box_weight.unsqueeze(1)
            + is_br * self.br_box_weight.unsqueeze(1)
        )

        # Execute mask_decoder without 5D torch.tile or GATHER_ND repeat_interleave
        md = self.mask_decoder
        output_tokens = torch.cat(
            [md.iou_token.weight, md.mask_tokens.weight], dim=0
        ).unsqueeze(0)
        tokens = torch.cat((output_tokens, point_embedding), dim=1)

        b, c, h, w = image_embeddings.shape
        hs, src = md.transformer(image_embeddings, self.dense_pe, tokens)
        iou_token_out = hs[:, 0, :]
        mask_tokens_out = hs[:, 1 : (1 + md.num_mask_tokens), :]

        upscaled_embedding = src.transpose(1, 2).reshape(b, c, h, w)
        for upscaling_layer in md.final_output_upscaling_layers:
            upscaled_embedding = upscaling_layer(upscaled_embedding)

        hyper_in_list = [
            mlp(mask_tokens_out[:, i, :])
            for i, mlp in enumerate(md.output_hypernetworks_mlps)
        ]
        hyper_in = torch.stack(hyper_in_list, dim=1)
        b_up, c_up, h_up, w_up = upscaled_embedding.shape
        masks = (
            hyper_in @ upscaled_embedding.reshape(b_up, c_up, h_up * w_up)
        ).reshape(b_up, -1, h_up, w_up)
        iou_pred = md.iou_prediction_head(iou_token_out)
        return masks[:, 1:, :], iou_pred[:, 1:]


def load_efficientsam_ti(repo_dir: Path, weights_path: Path):
    sys.path.insert(0, str(repo_dir))
    from efficient_sam.efficient_sam import build_efficient_sam

    if not weights_path.exists():
        weights_path.parent.mkdir(parents=True, exist_ok=True)
        print(f"Downloading EfficientSAM-Ti weights from {WEIGHTS_URL}...")
        urllib.request.urlretrieve(WEIGHTS_URL, str(weights_path))

    model = build_efficient_sam(
        encoder_patch_embed_dim=192,
        encoder_num_heads=3,
        checkpoint=str(weights_path),
    ).eval()
    return model


def main():
    parser = argparse.ArgumentParser(
        description="Export EfficientSAM-Ti to LiteRT .tflite"
    )
    parser.add_argument(
        "--repo-dir", type=str, required=True, help="Path to EfficientSAM repo"
    )
    parser.add_argument(
        "--output-dir", type=str, default="models", help="Output models directory"
    )
    parser.add_argument(
        "--img-size", type=int, default=512, help="Encoder input image resolution"
    )
    args = parser.parse_args()

    repo_dir = Path(args.repo_dir).resolve()
    weights_path = repo_dir / "weights" / "efficient_sam_vitt.pt"
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Loading PyTorch EfficientSAM-Ti from {weights_path}...")
    sam_model = load_efficientsam_ti(repo_dir, weights_path)

    encoder_wrapper = ExportFriendlyEncoder(sam_model, img_size=args.img_size).eval()
    decoder_wrapper = ExportFriendlyDecoder(
        sam_model, img_size=args.img_size, max_pts=6
    ).eval()

    # Verify numerical parity on dogs.jpg
    sample_img_path = repo_dir / "figs" / "examples" / "dogs.jpg"
    if sample_img_path.exists():
        img = (
            Image.open(sample_img_path)
            .convert("RGB")
            .resize((args.img_size, args.img_size))
        )
        img_np = np.asarray(img, dtype=np.float32) / 255.0
        img_t = torch.from_numpy(img_np).permute(2, 0, 1).unsqueeze(0)
    else:
        img_t = torch.rand(1, 3, args.img_size, args.img_size, dtype=torch.float32)

    pts_t = torch.tensor(
        [
            [
                [args.img_size * 0.35, args.img_size * 0.5],
                [-1.0, -1.0],
                [-1.0, -1.0],
                [-1.0, -1.0],
                [-1.0, -1.0],
                [-1.0, -1.0],
            ]
        ],
        dtype=torch.float32,
    )
    lbl_t = torch.tensor(
        [[1.0, -1.0, -1.0, -1.0, -1.0, -1.0]], dtype=torch.float32
    )

    with torch.no_grad():
        emb = encoder_wrapper(img_t)
        masks, ious = decoder_wrapper(emb, pts_t, lbl_t)
    print(
        f"PyTorch wrapper check -> embeddings: {tuple(emb.shape)}, masks: {tuple(masks.shape)}, ious: {ious.numpy()}"
    )

    import litert_torch

    encoder_tflite_path = output_dir / "efficientsam_ti_encoder.tflite"
    decoder_tflite_path = output_dir / "efficientsam_ti_decoder.tflite"

    print(f"Converting Encoder to {encoder_tflite_path}...")
    edge_encoder = litert_torch.convert(encoder_wrapper, (img_t,))
    edge_encoder.export(str(encoder_tflite_path))

    print(f"Converting Decoder to {decoder_tflite_path}...")
    edge_decoder = litert_torch.convert(decoder_wrapper, (emb, pts_t, lbl_t))
    edge_decoder.export(str(decoder_tflite_path))

    # Verify with LiteRT Interpreter
    edge_emb = edge_encoder(img_t)
    edge_masks, edge_ious = edge_decoder(emb, pts_t, lbl_t)
    emb_diff = np.max(np.abs(emb.numpy() - np.asarray(edge_emb)))
    mask_diff = np.max(np.abs(masks.numpy() - np.asarray(edge_masks)))
    print(
        f"LiteRT verification max abs diff -> encoder: {emb_diff:.6f}, decoder: {mask_diff:.6f}"
    )
    print("Successfully exported 4D-only LiteRT models!")


if __name__ == "__main__":
    main()
