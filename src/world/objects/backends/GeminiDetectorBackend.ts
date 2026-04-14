import {Gemini} from '../../../ai/Gemini';
import {GeminiResponse} from '../../../ai/AITypes';
import {parseBase64DataURL} from '../../../utils/utils';
import {BaseDetectorBackend} from '../ObjectDetectorBackend';
import {CameraSnapshot, NormalizedDetectedObject} from '../ObjectDetector';

/**
 * Object detector backend implementation using Gemini via the AI service.
 * Sends image data to a remote model for detection.
 *
 * T - The type of additional data associated with the detected object.
 */
export class GeminiDetectorBackend<T> extends BaseDetectorBackend<T> {
  protected async isAvailable(): Promise<boolean> {
    return !!this.context.ai.isAvailable();
  }

  protected async getSnapshot(): Promise<{base64: string} | null> {
    const base64Image = await this.context.deviceCamera.getSnapshot({
      outputFormat: 'base64',
    });
    if (!base64Image) return null;
    return {base64: base64Image};
  }

  private buildGeminiConfig() {
    const geminiOptions = this.context.options.objects.backendConfig.gemini;
    return {
      thinkingConfig: {
        thinkingBudget: 0,
      },
      responseMimeType: 'application/json',
      responseSchema: geminiOptions.responseSchema,
      systemInstruction: [{text: geminiOptions.systemInstruction}],
    };
  }

  protected async detect(
    snapshot: CameraSnapshot
  ): Promise<NormalizedDetectedObject<T>[]> {
    const {mimeType, strippedBase64} = parseBase64DataURL(snapshot.base64!);

    const config = this.buildGeminiConfig();

    const originalGeminiConfig = this.context.aiOptions.gemini.config;
    this.context.aiOptions.gemini.config = config;
    const textPrompt = 'What do you see in this image?';

    let backendResponse: GeminiResponse | null = null;
    try {
      backendResponse = await (this.context.ai.model as Gemini).query({
        type: 'multiPart',
        parts: [
          {inlineData: {mimeType: mimeType || undefined, data: strippedBase64}},
          {text: textPrompt},
        ],
      });
    } catch (e) {
      console.error('Gemini detection failed', e);
      return [];
    } finally {
      this.context.aiOptions.gemini.config = originalGeminiConfig;
    }

    return this.normalizeDetections(backendResponse);
  }

  private normalizeDetections(
    backendResponse: GeminiResponse | null
  ): NormalizedDetectedObject<T>[] {
    let parsedResponse;
    try {
      if (backendResponse && backendResponse.text) {
        parsedResponse = JSON.parse(backendResponse.text);
      } else {
        return [];
      }
    } catch (e) {
      console.warn('Error while normalizing detections in Gemini Response', e);
      return [];
    }

    if (!Array.isArray(parsedResponse)) return [];

    // Map Gemini JSON response to NormalizedDetectedObject format.
    // Gemini returns coordinates in the range [0, 1000], so we divide by 1000 to normalize.
    return parsedResponse.reduce<NormalizedDetectedObject<T>[]>((acc, item) => {
      const {ymin, xmin, ymax, xmax, objectName, ...additionalData} =
        item || {};
      if (
        [ymin, xmin, ymax, xmax].every((coord) => typeof coord === 'number')
      ) {
        acc.push({
          ymin: ymin / 1000,
          xmin: xmin / 1000,
          ymax: ymax / 1000,
          xmax: xmax / 1000,
          objectName: objectName || 'unknown',
          additionalData: additionalData as T,
        });
      }
      return acc;
    }, []);
  }
}
