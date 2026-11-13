export interface ApiEnvelope<T> { success: boolean; data: T }
export interface User { id: string; email: string }
export interface Project { id: string; name: string; createdAt: string }
export interface TimeRange { preset: string; from: string; to: string }
export interface Overview { projectId: string; range: TimeRange; metrics: { totalRequests: number; averageLatencyMs: number; errorCount: number; successCount: number; errorRate: number; successRate: number } }
export interface TrafficPoint { timestamp: string; requestCount: number; averageLatencyMs: number }
export interface StatusGroup { statusCode: number; count: number; percentage: number }
export interface EndpointCount { method: string; route: string; requestCount: number }
export interface SlowEndpoint extends EndpointCount { averageLatencyMs: number }
export interface ErrorEndpoint extends EndpointCount { errorCount: number; errorRate: number }
export interface RequestLog { id: string; method: string; route: string; statusCode: number; latency: number; timestamp: string }
export interface RecentRequests { projectId: string; range: TimeRange; pagination: { page: number; limit: number; total: number; totalPages: number }; data: RequestLog[] }
export interface ApiKey { id: string; createdAt: string; revokedAt: string | null }
