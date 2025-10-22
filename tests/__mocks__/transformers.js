/**
 * Mock for @xenova/transformers to avoid downloading models in tests
 */
export const pipeline = jest.fn().mockResolvedValue({
  similarity: jest.fn().mockResolvedValue(0.8)
});

export const AutoTokenizer = {
  from_pretrained: jest.fn().mockResolvedValue({
    encode: jest.fn().mockReturnValue([1, 2, 3])
  })
};