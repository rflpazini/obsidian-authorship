import { describe, it, expect } from "vitest";
import {
  annotationBlockToRanges,
  rangesToAnnotationAuthors,
} from "../../src/core/AuthorshipTracker";
import { SourceType, SOURCE_PREFIX } from "../../src/types";
import type { AnnotationBlock, AuthorshipRange } from "../../src/types";

describe("annotationBlockToRanges", () => {
  it("converts a simple annotation block to ranges", () => {
    const block: AnnotationBlock = {
      hash: {
        textRange: { from: 0, length: 10 },
        algorithm: "SHA-256",
        hash: "abc123def456789012345678",
      },
      authors: [
        {
          author: { name: "Self", prefix: SOURCE_PREFIX.HUMAN },
          ranges: [{ from: 0, length: 5 }],
        },
        {
          author: { name: "AI", prefix: SOURCE_PREFIX.AI },
          ranges: [{ from: 5, length: 5 }],
        },
      ],
    };

    const ranges = annotationBlockToRanges(block, "0123456789");
    expect(ranges).toHaveLength(2);
    expect(ranges[0].sourceType).toBe(SourceType.SELF);
    expect(ranges[0].from).toBe(0);
    expect(ranges[0].length).toBe(5);
    expect(ranges[1].sourceType).toBe(SourceType.AI);
    expect(ranges[1].from).toBe(5);
    expect(ranges[1].length).toBe(5);
  });

  it("converts grapheme positions to utf16 for emoji text", () => {
    const text = "a👍bc";
    const block: AnnotationBlock = {
      hash: {
        textRange: { from: 0, length: 4 },
        algorithm: "SHA-256",
        hash: "abc123def456789012345678",
      },
      authors: [
        {
          author: { name: "Self", prefix: SOURCE_PREFIX.HUMAN },
          ranges: [{ from: 2, length: 2 }],
        },
      ],
    };

    const ranges = annotationBlockToRanges(block, text);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].from).toBe(3);
    expect(ranges[0].length).toBe(2);
  });

  it("handles reference material prefix", () => {
    const block: AnnotationBlock = {
      hash: {
        textRange: { from: 0, length: 10 },
        algorithm: "SHA-256",
        hash: "abc123def456789012345678",
      },
      authors: [
        {
          author: { name: "Wikipedia", prefix: SOURCE_PREFIX.REFERENCE },
          ranges: [{ from: 0, length: 10 }],
        },
      ],
    };

    const ranges = annotationBlockToRanges(block, "0123456789");
    expect(ranges[0].sourceType).toBe(SourceType.REFERENCE);
    expect(ranges[0].authorName).toBe("Wikipedia");
  });

  it("returns ranges sorted by from position", () => {
    const block: AnnotationBlock = {
      hash: {
        textRange: { from: 0, length: 10 },
        algorithm: "SHA-256",
        hash: "abc123def456789012345678",
      },
      authors: [
        {
          author: { name: "AI", prefix: SOURCE_PREFIX.AI },
          ranges: [{ from: 5, length: 5 }],
        },
        {
          author: { name: "Self", prefix: SOURCE_PREFIX.HUMAN },
          ranges: [{ from: 0, length: 5 }],
        },
      ],
    };

    const ranges = annotationBlockToRanges(block, "0123456789");
    expect(ranges[0].from).toBeLessThan(ranges[1].from);
  });

  it("maps @Pasted back to SourceType.PASTED", () => {
    const block: AnnotationBlock = {
      hash: {
        textRange: { from: 0, length: 10 },
        algorithm: "SHA-256",
        hash: "abc123def456789012345678",
      },
      authors: [
        {
          author: { name: "Pasted", prefix: SOURCE_PREFIX.HUMAN },
          ranges: [{ from: 0, length: 10 }],
        },
      ],
    };

    const ranges = annotationBlockToRanges(block, "0123456789");
    expect(ranges[0].sourceType).toBe(SourceType.PASTED);
    expect(ranges[0].authorName).toBe("Pasted");
  });

  it("returns empty array for block with no authors", () => {
    const block: AnnotationBlock = {
      hash: {
        textRange: { from: 0, length: 5 },
        algorithm: "SHA-256",
        hash: "abc123def456789012345678",
      },
      authors: [],
    };

    expect(annotationBlockToRanges(block, "hello")).toEqual([]);
  });
});

describe("rangesToAnnotationAuthors", () => {
  it("groups ranges by author", () => {
    const ranges: AuthorshipRange[] = [
      { from: 0, length: 5, sourceType: SourceType.SELF, authorName: "Self" },
      { from: 5, length: 5, sourceType: SourceType.AI, authorName: "AI" },
      { from: 10, length: 5, sourceType: SourceType.SELF, authorName: "Self" },
    ];

    const authors = rangesToAnnotationAuthors(ranges, "012345678901234");
    expect(authors).toHaveLength(2);

    const selfAuthor = authors.find((a) => a.author.name === "Self");
    expect(selfAuthor).toBeDefined();
    expect(selfAuthor!.ranges).toHaveLength(2);
    expect(selfAuthor!.author.prefix).toBe(SOURCE_PREFIX.HUMAN);

    const aiAuthor = authors.find((a) => a.author.name === "AI");
    expect(aiAuthor).toBeDefined();
    expect(aiAuthor!.ranges).toHaveLength(1);
    expect(aiAuthor!.author.prefix).toBe(SOURCE_PREFIX.AI);
  });

  it("converts utf16 positions to grapheme indexes", () => {
    const text = "a👍b";
    const ranges: AuthorshipRange[] = [
      { from: 3, length: 1, sourceType: SourceType.SELF, authorName: "Self" },
    ];

    const authors = rangesToAnnotationAuthors(ranges, text);
    expect(authors[0].ranges[0]).toEqual({ from: 2, length: 1 });
  });

  it("returns empty array for empty ranges", () => {
    expect(rangesToAnnotationAuthors([], "hello")).toEqual([]);
  });

  it("assigns correct prefix for reference type", () => {
    const ranges: AuthorshipRange[] = [
      { from: 0, length: 5, sourceType: SourceType.REFERENCE, authorName: "Ref" },
    ];

    const authors = rangesToAnnotationAuthors(ranges, "hello");
    expect(authors[0].author.prefix).toBe(SOURCE_PREFIX.REFERENCE);
  });
});
