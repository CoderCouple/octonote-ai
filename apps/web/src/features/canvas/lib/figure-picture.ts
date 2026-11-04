/**
 * One figure, drawing its picture first if it has none and you can edit it: a
 * canvas made by the CLI or an assistant has no picture until a browser draws one.
 * Browser only, and kept out of the canvas index: the import below brings in the
 * canvas engine, which can't be part of server components.
 */
import { getFigureClientApi, type FigureView } from "../api/figures-client-api";

export async function getFigureWithPicture(figureId: string): Promise<FigureView> {
  const figure = await getFigureClientApi(figureId);
  if (figure.imageUrl || !figure.draw || !figure.canvasId) return figure;
  try {
    const { uploadFigurePicture } = await import("./figures");
    await uploadFigurePicture(figure.canvasId, figureId, figure.title, figure.draw);
    return await getFigureClientApi(figureId);
  } catch (err) {
    console.warn("Couldn't draw this figure", err);
    return figure;
  }
}
