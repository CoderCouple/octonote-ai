export { parseDiagram, parseDiagramWithSpans } from './dsl/parse';
export type * from './dsl/types';
export {
  addChild,
  addGroup,
  applyEdits,
  CONNECTORS,
  declareNode,
  deleteEdge,
  deleteNode,
  renameNode,
  reverseEdge,
  setEdgeConnector,
  setEdgeLabel,
  setEdgeProperty,
  setNodeProperty,
} from './dsl/edit';
export type { AddGroupOptions, DiagramEdit, EditResult, InsertOptions } from './dsl/edit';
export { buildView, canDrillInto } from './view/view';
export type * from './view/view';
export { estimateTextWidth, layoutView, wrapText, DEFAULT_TYPOGRAPHY } from './layout/layout';
export type * from './layout/layout';
export { listIconNames, loadEraserIcons, loadFullIconCatalog, loadVendorIcons, onIconCatalogChange, resolveIcon } from './icons/resolve';
export type { IconSet } from './icons/resolve';
export type * from './icons/types';
export { darkTheme, lightTheme, PALETTE_NAMES, themeCssVariables, themes } from './theme/tokens';
export type * from './theme/tokens';
export { importEraserJson, looksLikeEraserJson } from './eraser/importJson';
export type { ImportedDiagram } from './eraser/importJson';
export { DiagramSvg } from './react/DiagramSvg';
export type { DiagramAnimation, DiagramSvgProps } from './react/DiagramSvg';
export { OctoDiagram } from './react/OctoDiagram';
export type { CopyFormat, ExportFormat, OctoDiagramHandle, OctoDiagramProps, SourceChangeMeta } from './react/OctoDiagram';
export { actionToEdits, runToolbarAction, selectionTarget, toolbarControls } from './react/toolbar/actions';
export type { DiagramSelection, SelectionKind, SelectionTarget, ToolbarAction, ToolbarContext, ToolbarControl, ToolbarResult } from './react/toolbar/actions';
export { renderSourceSvg, type SourceSvgOptions } from './export/source';
export { renderDiagramSvg } from './export/svg';
export type { RenderSvgOptions, RenderedSvg } from './export/svg';
export { exportEraserJson, exportEraserXml } from './export/eraserJson';
export { registerPdfFonts, type PdfFont, collectFontCss, embedSnippets, svgToPdf, svgToPng } from './export/browser';
export { detectDiagramType } from './dsl/detect';
export type { DiagramType } from './dsl/detect';
export { ERD_KEYWORDS, parseErd, parseErdWithSpans } from './dsl/erd';
export type * from './dsl/erd';
export { parseSequence, parseSequenceWithSpans, SEQUENCE_KEYWORDS, sequenceActivations } from './dsl/sequence';
export type * from './dsl/sequence';
export { ErdSvg, layoutErd } from './erd/erd';
export type { ErdLayout } from './erd/erd';
export { layoutSequence, SequenceSvg } from './sequence/sequence';
export type { SequenceLayout } from './sequence/sequence';
export { diagramSystemPrompt } from './ai/prompt';
export type { SystemPromptOptions } from './ai/prompt';
export { diagramServerStatus, httpDiagramModel, type HttpModelOptions } from './ai/http';
export { attachmentFromFile, attachmentsFromFolder, attachmentsFromGitHub, attachmentsText, parseGitHubRepo, classifyAttachment, filesFromZip, isZip, messageText, suggestDiagramType, type ContentPart, type DiagramAttachment } from './ai/attachments';
export { buildUserContent, buildUserMessage, extractDiagramCode, generateDiagram, validateDiagram } from './ai/generate';
export type { DiagramModel, DiagramModelRequest, DiagramReference, GenerateOptions, GenerateResult, ModelMessage, ValidationResult } from './ai/generate';
export { historyFromMessages, useDiagramChat } from './ai/useDiagramChat';
export type { ChatMessage, ChatStatus, SendOptions, UseDiagramChatOptions } from './ai/useDiagramChat';
export { DiagramChat } from './ai/DiagramChat';
export type { DiagramChatProps } from './ai/DiagramChat';
export { OctoCanvas } from './canvas/OctoCanvas';
export { moveSlide, presentationSlides, setSlideHidden, setSlideNotes, visibleSlides, type Slide } from './canvas/present';
export { VersionHistory, type VersionHistoryProps } from './canvas/VersionHistory';
export { createVersion, diffDocuments, isEmptyDiff, localVersionStore, sameDocument, useVersionHistory, type CanvasVersion, type DocumentDiff, type VersionHistoryOptions, type VersionStore } from './canvas/versions';
export type { CanvasTool, OctoCanvasHandle, OctoCanvasProps } from './canvas/OctoCanvas';
export {
  addComment,
  addItems,
  boundsOf,
  commentPosition,
  mentionsIn,
  safeLink,
  removeComment,
  replyToComment,
  resizeItems,
  selectionToSource,
  snapBox,
  updateComment,
  boxesIntersect,
  boxFromPoints,
  centerOf,
  cloneItems,
  cloneWithComments,
  duplicateItems,
  emptyDocument,
  getItem,
  isCanvasDocument,
  itemAt,
  itemsInBox,
  lineBetween,
  lineEnds,
  lineGeometry,
  lineBounds,
  withLineBox,
  bendControl,
  bendThrough,
  anchorPoint,
  anchoredEnd,
  distanceToLine,
  pointOnLine,
  moveItems,
  newItemId,
  penFromPoints,
  removeItems,
  reorderItems,
  resizeBox,
  resizeItem,
  resolveLines,
  updateItem,
  canRotate,
  offsetInItem,
  resizeRotatedBox,
  rotateItems,
  rotatedBounds,
  rotatePoint,
  copyStyle,
  pasteStyle,
  patchItems,
  colorPartPatch,
  wholeColorPatch,
  routePatch,
  withoutLegacy,
  lineHeads,
  lineRoute,
  lineBend,
  strokeStyleOf,
  isColorValue,
  STROKE_WIDTHS,
  DEFAULT_STROKE_WIDTH,
  STYLE_KEYS,
} from './canvas/model';
export type { LineGeometry, ShapeFill, HorizontalAlign, VerticalAlign, ArrowHead, LineRoute, StrokeStyle, FontFamily, CanvasStyle, ColorPart, StyleKey } from './canvas/model';
export type { Box, CanvasDocument, CanvasItem, CanvasPeer, PresentationSettings, CanvasItemType, CodeItem, CommentAuthor, CommentMessage, CommentThread, DeviceKind, Endpoint, FigureItem, FrameItem, Handle, IconItem, ImageItem, ItemPatch, LayerMove, LineItem, PenItem, ShapeItem, ShapeKind, SnapResult, StickyItem, TextItem } from './canvas/model';
export { renderCanvasSvg } from './canvas/export';
export type { CanvasSvgOptions } from './canvas/export';
export { useCanvasHistory } from './canvas/useCanvasHistory';
export type { CanvasChangeMeta } from './canvas/useCanvasHistory';
export { CANVAS_TEMPLATES, FIGURE_TEMPLATES, figureTitle, type CanvasTemplate } from './canvas/templates';
export { arrangeLayout, canResizeNode, placementKey } from './layout/arrange';
export type { NodePlacement, NodePlacements, ViewPlacements } from './layout/arrange';
export {
  addColumn,
  applyErdEdits,
  deleteColumn,
  deleteEntity,
  deleteRelationship,
  ERD_COLUMN_KEYS,
  ERD_CONNECTORS,
  erdColumnNameProblem,
  erdNameProblem,
  renameColumn,
  renameEntity,
  setColumnKey,
  setColumnType,
  setEntityProperty,
  setRelationshipConnector,
  setRelationshipLabel,
  setRelationshipProperty,
} from './dsl/edit-erd';
export type { ErdEdit } from './dsl/edit-erd';
export {
  applySequenceEdits,
  deleteActivation,
  deleteBlock,
  deleteMessage,
  deleteParticipant,
  messageDirectionOf,
  messageLineOf,
  participantMessageCount,
  renameParticipant,
  blockMessageCount,
  BLOCK_KINDS,
  sequenceNameProblem,
  setBlockKind,
  setBlockLabel,
  setBlockProperty,
  unwrapBlock,
  setMessageDirection,
  setMessageLabel,
  setMessageLine,
  setMessageProperty,
  setParticipantProperty,
} from './dsl/edit-sequence';
export type { MessageDirection, MessageLine, SequenceEdit } from './dsl/edit-sequence';
export { CARDINALITIES, erdActionToEdits, erdControls, erdTarget, runErdAction } from './react/toolbar/erd';
export type { ErdControl, ErdTarget, ErdToolbarAction } from './react/toolbar/erd';
export { runSequenceAction, sequenceActionToEdits, sequenceControls, sequenceTarget } from './react/toolbar/sequence';
export type { SequenceControl, SequenceTarget, SequenceToolbarAction } from './react/toolbar/sequence';
