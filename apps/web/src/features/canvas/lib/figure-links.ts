/** The ways to share a figure, from its link. No canvas engine imports. */
export interface FigureLinks {
  link: string;
  image: string;
  markdown: string;
  embed: string;
}

const attr = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function figureLinks(figure: { url: string; title: string }): FigureLinks {
  const image = `${figure.url}.png`;
  const alt = figure.title.replace(/[[\]\n]/g, " ").trim();
  return {
    link: figure.url,
    image,
    markdown: `![${alt}](${image})`,
    embed: `<a href="${attr(figure.url)}"><img src="${attr(image)}" alt="${attr(figure.title)}" /></a>`,
  };
}

export const FIGURE_LINK_LABELS: Record<keyof FigureLinks, string> = {
  link: "Copy link",
  image: "Copy image URL",
  markdown: "Copy markdown",
  embed: "Copy embed code",
};

export const figureAudience = (isPublic: boolean) =>
  isPublic ? "Anyone with the link can open this." : "Only people with access can open this.";
