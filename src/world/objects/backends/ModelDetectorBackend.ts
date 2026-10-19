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
    if (!options.model || !snapshot.base64) return [];
    const {mimeType, strippedBase64} = parseBase64DataURL(snapshot.base64);
    const {generateText, Output, jsonSchema} = await import('ai');
    const {output} = await generateText({
      ...options.generationConfig,
      model: options.model,
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
        element: jsonSchema<Detection>(options.responseSchema),
      }),
    });
    return output.flatMap(
      ({ymin, xmin, ymax, xmax, objectName, ...additionalData}) =>
        [ymin, xmin, ymax, xmax].every(Number.isFinite)
          ? [
              {
                ymin: ymin / 1000,
                xmin: xmin / 1000,
                ymax: ymax / 1000,
                xmax: xmax / 1000,
                objectName,
                additionalData: additionalData as T,
              },
            ]
          : []
    );
  }
}
