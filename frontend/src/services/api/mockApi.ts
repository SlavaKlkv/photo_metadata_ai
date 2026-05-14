// Mock API for development and testing

export const mockData = {
  metadata: [],
};

export const getMockMetadata = () => {
  return Promise.resolve(mockData.metadata);
};
