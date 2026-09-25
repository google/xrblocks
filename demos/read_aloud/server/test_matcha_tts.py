"""Unit tests for the model-free parts of matcha_tts (run: python -m unittest)."""

import unittest

import numpy as np

from matcha_tts import (G2P, length_regulate, number_to_words, parse_dict,
                        phonemize, sin_pos_emb, split_sentences)
from server import OCR_PROMPT, ollama_chat_request

META = {
    "char2idx": {"a": 3, "b": 4},
    "idx2ph": ["_", "<en_us>", "<end>", "ɐ", "b"],
    "char_repeats": 3,
    "start": 1,
    "end": 2,
    "MAXT": 96,
    "n_phonemes": 5,
    "special": ["<en_us>", "<end>"],
}


class FakeModel:
    def __init__(self, phoneme_rows):
        self.rows = phoneme_rows
        self.calls = []

    def run(self, inp):
        self.calls.append(inp.copy())
        logits = np.zeros((1, META["MAXT"], META["n_phonemes"]), np.float32)
        for pos, k in enumerate(self.rows):
            logits[0, pos, k] = 1
        return [logits]


def symbols(chars):
    return {c: i + 1 for i, c in enumerate(chars)}


class NumberToWordsTest(unittest.TestCase):
    def test_values(self):
        self.assertEqual(number_to_words("0"), "zero")
        self.assertEqual(number_to_words("42"), "forty two")
        self.assertEqual(number_to_words("1234"), "one thousand two hundred thirty four")
        self.assertEqual(number_to_words("3.14"), "three point one four")
        self.assertEqual(number_to_words("2000000"), "two million")


class ParseDictTest(unittest.TestCase):
    def test_skips_malformed(self):
        d = parse_dict("hello\thəl\nbroken\nworld\twɜ\n")
        self.assertEqual(d, {"hello": "həl", "world": "wɜ"})


class SplitSentencesTest(unittest.TestCase):
    def test_splits_on_sentences_and_paragraphs(self):
        text = "First one. Second one! Third\n\nNew paragraph without end"
        self.assertEqual(split_sentences(text),
                         ["First one.", "Second one!", "Third", "New paragraph without end"])

    def test_empty(self):
        self.assertEqual(split_sentences("   \n\n "), [])


class G2PTest(unittest.TestCase):
    def test_dictionary_then_neural_with_cache(self):
        model = FakeModel([1, 3, 3, 3, 4, 4, 4, 2])
        g2p = G2P({"known": "nˈoʊn"}, META, model)
        self.assertEqual(g2p.word_to_ipa("known"), "nˈoʊn")
        self.assertEqual(model.calls, [])
        self.assertEqual(g2p.word_to_ipa("ab"), "ɐb")
        self.assertEqual(len(model.calls), 1)
        np.testing.assert_array_equal(model.calls[0][0, :8], [1, 3, 3, 3, 4, 4, 4, 2])
        self.assertEqual(g2p.word_to_ipa("ab"), "ɐb")
        self.assertEqual(len(model.calls), 1)


class PhonemizeTest(unittest.TestCase):
    def setUp(self):
        self.sym = symbols(" .,?hiðɛtukæs")
        self.g2p = G2P({"hi": "hi", "there": "ðɛ", "two": "tu", "cats": "kæts"}, META, None)

    def test_words_punctuation_sentences(self):
        chunks = phonemize(self.g2p, self.sym, "Hi there. Hi, there!")
        self.assertEqual([c["ipa"] for c in chunks], ["hi ðɛ.", "hi, ðɛ."])
        self.assertEqual(chunks[0]["ids"], [self.sym[ch] for ch in "hi ðɛ."])

    def test_numbers_and_unknown_words(self):
        chunks = phonemize(self.g2p, self.sym, "2 cats and 2 dogs")
        self.assertEqual([c["ipa"] for c in chunks], ["tu kæts tu"])

    def test_budget(self):
        chunks = phonemize(self.g2p, self.sym, "hi there hi there hi", max_pids=8)
        self.assertEqual([c["ipa"] for c in chunks], ["hi ðɛ hi", "ðɛ hi"])


class SynthHelpersTest(unittest.TestCase):
    def test_sin_pos_emb(self):
        np.testing.assert_allclose(sin_pos_emb(0, 6)[0], [0, 0, 0, 1, 1, 1])
        self.assertEqual(sin_pos_emb(0.5, 160).shape, (1, 160))

    def test_length_regulate(self):
        cfg = {"MAX_TEXT": 8, "MAX_MEL": 16, "n_feats": 2, "length_scale": 1}
        mu = np.arange(16, dtype=np.float32).reshape(2, 8)
        logw = np.full(8, np.log(2), np.float32)
        tmask = np.array([1, 1, 1, 1, 1, 0, 0, 0], np.float32)
        mu_y, ylen = length_regulate(mu, logw, tmask, cfg)
        self.assertEqual(ylen, 10)  # 5 valid positions x 2 frames
        np.testing.assert_array_equal(mu_y[0, :10], [0, 0, 1, 1, 2, 2, 3, 3, 4, 4])
        self.assertEqual(mu_y[0, 10], 0)




class OllamaRequestTest(unittest.TestCase):
    def test_prompt_image_and_json_mode(self):
        body = ollama_chat_request("m", "say hi", "AAAA")
        self.assertEqual(body["messages"], [{"role": "user", "content": "say hi", "images": ["AAAA"]}])
        self.assertNotIn("format", body)
        self.assertEqual(ollama_chat_request("m", OCR_PROMPT, "AAAA", want_json=True)["format"], "json")


if __name__ == "__main__":
    unittest.main()
