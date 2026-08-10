import * as xb from 'xrblocks';

import {GNMControls} from './GNMControls.js';
import {GNMHeadModel} from './GNMModel.js';
import {GNMScene} from './GNMScene.js';
import {GNMSamplers} from './SemanticSampler.js';
import {GNMSpatialUI} from './GNMSpatialUI.js';

const CDN_ASSETS_BASE =
  'https://rawcdn.githack.com/xrblocks/assets-gnm/8480138a42ae746a2f7c9808a51ef23af7648653';
const LOCAL_ASSETS_BASE = './assets';
const USE_LOCAL_ASSETS = false;

const useLocalAssets = xb.getUrlParamBool('localAssets', USE_LOCAL_ASSETS);
const assetsBase = useLocalAssets ? LOCAL_ASSETS_BASE : CDN_ASSETS_BASE;
const headModelUrl = `${assetsBase}/gnm_head_web.bin`;
const samplersUrl = `${assetsBase}/gnm_samplers_web.bin`;

function setLoadingProgress(fraction, label) {
  const bar = document.querySelector('#gnm-loading .bar div');
  const text = document.querySelector('#gnm-loading p');
  if (bar) bar.style.width = `${Math.round(fraction * 100)}%`;
  if (label && text) text.textContent = label;
}

async function start() {
  try {
    let modelProgress = 0;
    let samplerProgress = 0;
    const report = () =>
      setLoadingProgress(
        modelProgress * 0.92 + samplerProgress * 0.08,
        'Downloading GNM model data…'
      );

    const [model, samplers] = await Promise.all([
      GNMHeadModel.load(headModelUrl, (progress) => {
        modelProgress = progress;
        report();
      }),
      GNMSamplers.load(samplersUrl, (progress) => {
        samplerProgress = progress;
        report();
      }),
    ]);
    setLoadingProgress(1, 'Starting XR Blocks…');

    const scene = new GNMScene(model, samplers);
    scene.spatialUI = new GNMSpatialUI(scene);
    xb.add(scene);

    const controls = new GNMControls(model, samplers, scene);
    controls.attach();
    window.gnm = {model, samplers, scene, controls};

    const options = new xb.Options();
    options.enableReticles();
    options.setAppTitle('Avatar Lab · GNM Head Explorer');
    options.setAppDescription(
      'Explore every identity, expression, pose, animation, and mesh control in the GNM head model.'
    );
    options.xrButton.startText = '<i id="xrlogo"></i> EXPLORE IN XR';
    options.xrButton.endText = '<i id="xrlogo"></i> EXIT XR';

    await xb.init(options);
    document.getElementById('gnm-loading')?.remove();
  } catch (error) {
    setLoadingProgress(0, `Failed to load: ${error.message}`);
    console.error(error);
  }
}

document.addEventListener('DOMContentLoaded', start);
