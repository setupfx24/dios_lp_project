import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(256),
});

export const apiKeyCreateSchema = z.object({
  brokerId: z.string().min(1).max(64),
  label: z.string().min(1).max(80),
  ipAllowlist: z.array(z.string().ip()).optional().default([]),
});

export const apiKeyResponseSchema = z.object({
  apiKeyId: z.string(),
  apiKey: z.string(),
  apiSecret: z.string(),
  createdAt: z.string(),
});

export type LoginDto = z.infer<typeof loginSchema>;
export type ApiKeyCreateDto = z.infer<typeof apiKeyCreateSchema>;
export type ApiKeyResponseDto = z.infer<typeof apiKeyResponseSchema>;
