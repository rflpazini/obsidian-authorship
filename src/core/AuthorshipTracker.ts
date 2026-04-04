import type { AuthorshipRange, AnnotationBlock, AuthorDefinition } from "../types";
import { SourceType, SOURCE_PREFIX, PREFIX_TO_DEFAULT_SOURCE } from "../types";
import type { CharacterRange } from "../types";
import { graphemeToUtf16, buildSegmentMap, utf16ToGrapheme } from "../utils/grapheme";

export function annotationBlockToRanges(
  block: AnnotationBlock,
  documentText: string,
): AuthorshipRange[] {
  const segmentMap = buildSegmentMap(documentText);
  const ranges: AuthorshipRange[] = [];

  for (const authorAnnotation of block.authors) {
    const { prefix, name } = authorAnnotation.author;
    let sourceType = PREFIX_TO_DEFAULT_SOURCE[prefix] ?? SourceType.SELF;
    if (prefix === SOURCE_PREFIX.HUMAN && name === "Pasted") {
      sourceType = SourceType.PASTED;
    }

    for (const range of authorAnnotation.ranges) {
      const utf16From = graphemeToUtf16(segmentMap, range.from);
      const utf16To = graphemeToUtf16(segmentMap, range.from + range.length);

      ranges.push({
        from: utf16From,
        length: utf16To - utf16From,
        sourceType,
        authorName: name,
      });
    }
  }

  return ranges.sort((a, b) => a.from - b.from);
}

export function rangesToAnnotationAuthors(
  ranges: readonly AuthorshipRange[],
  documentText: string,
): { author: AuthorDefinition; ranges: CharacterRange[] }[] {
  const segmentMap = buildSegmentMap(documentText);
  const authorMap = new Map<
    string,
    { author: AuthorDefinition; ranges: CharacterRange[] }
  >();

  for (const r of ranges) {
    const key = `${r.sourceType}:${r.authorName}`;

    if (!authorMap.has(key)) {
      const prefix =
        r.sourceType === SourceType.AI
          ? SOURCE_PREFIX.AI
          : r.sourceType === SourceType.REFERENCE
            ? SOURCE_PREFIX.REFERENCE
            : SOURCE_PREFIX.HUMAN;

      authorMap.set(key, {
        author: { name: r.authorName, prefix },
        ranges: [],
      });
    }

    const graphemeFrom = utf16ToGrapheme(segmentMap, r.from);
    const graphemeTo = utf16ToGrapheme(segmentMap, r.from + r.length);

    authorMap.get(key)!.ranges.push({
      from: graphemeFrom,
      length: graphemeTo - graphemeFrom,
    });
  }

  return [...authorMap.values()];
}
