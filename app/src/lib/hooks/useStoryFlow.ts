import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type {
  StoryFlowParseRequest,
  StoryFlowGenerateRequest,
  StoryFlowSpeakerConfig,
} from '@/lib/api/types';

export function useParseStoryFlow() {
  return useMutation({
    mutationFn: (data: StoryFlowParseRequest) => apiClient.parseStoryFlow(data),
  });
}

export function useGenerateStoryFlow() {
  return useMutation({
    mutationFn: (data: StoryFlowGenerateRequest) => apiClient.generateStoryFlow(data),
  });
}

export function useStoryFlow() {
  const parseStoryFlow = useParseStoryFlow();
  const generateStoryFlow = useGenerateStoryFlow();

  return {
    parseScript: parseStoryFlow.mutateAsync,
    parseResult: parseStoryFlow.data,
    parseError: parseStoryFlow.error,
    isParsing: parseStoryFlow.isPending,

    generateStoryFlow: generateStoryFlow.mutateAsync,
    generateResult: generateStoryFlow.data,
    generateError: generateStoryFlow.error,
    isGenerating: generateStoryFlow.isPending,

    resetParse: parseStoryFlow.reset,
    resetGenerate: generateStoryFlow.reset,
  };
}

export type { StoryFlowSpeakerConfig };
