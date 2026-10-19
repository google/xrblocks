import {parseBase64DataURL} from '../../../utils/utils';
import {BaseDetectorBackend} from '../ObjectDetectorBackend';
import type {CameraSnapshot, NormalizedDetectedObject} from '../ObjectDetector';

type Detection = {
  objectName: string;
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
  [key: string]: unknown;
};

export class ModelDetectorBackend<T> extends BaseDetectorBackend<T> {
  protected async isAvailable(): Promise<boolean> {
    return !!this.context.options.objects.backendConfig.model.model;
  }

  protected async getSnapshot(): Promise<{base64: string} | null> {
    const base64 = await this.context.deviceCamera.getSnapshot({
      outputFormat: 'base64',
    });
    return base64 ? {base64} : null;
  }

  protected async detect(
    snapshot: CameraSnapshot
  ): Promise<NormalizedDetectedObject<T>[]> {
    const options = this.context.options.objects.backendConfig.model;
    const model = options.model;
    if (!model || !snapshot.base64) return [];
    const {mimeType, strippedBase64} = parseBase64DataURL(snapshot.base64);
    const {generateText, Output, jsonSchema} = await import('ai');
    const {output} = await generateText({
      ...options.generationConfig,
      model,
      system: options.systemInstruction,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: strippedBase64,
              mediaType: mimeType ?? 'image/jpeg',
            },
            {type: 'text', text: 'What do you see in this image?'},
          ],
        },
      ],
      output: Output.array({
        element: jsonSchema<unknown>(options.responseSchema),
      }),
    });
    return output
      .filter(isDetection)
      .map(({ymin, xmin, ymax, xmax, objectName, ...additionalData}) => ({
        ymin: ymin / 1000,
        xmin: xmin / 1000,
        ymax: ymax / 1000,
        xmax: xmax / 1000,
        objectName,
        additionalData: additionalData as T,
      }));
  }
}

function isDetection(value: unknown): value is Detection {
  if (!value || typeof value !== 'object') return false;
  const {objectName, ymin, xmin, ymax, xmax} = value as Detection;
  return (
    typeof objectName === 'string' &&
    objectName.trim().length > 0 &&
    [ymin, xmin, ymax, xmax].every(
      (coordinate) =>
        Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1000
    ) &&
    ymin < ymax &&
    xmin < xmax
  );
}
