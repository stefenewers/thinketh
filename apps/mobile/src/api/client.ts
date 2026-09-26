import type {
  AskRequest,
  AskResponse,
  BriefResponse,
  ConceptHistoryResponse,
  DevelopmentDetailResponse,
  DiagnosticAnswerResponse,
  DiagnosticSelectRequest,
  DiagnosticSelectResponse,
  DiagramSpec,
  FeedbackKind,
  FeedbackResponse,
  KnowledgeResponse,
  LearningRequest,
  MemoryAid,
  VoiceSession,
} from "@thinketh/contracts";

// One method per Thinketh endpoint. Shapes are the canonical envelopes in
// packages/contracts; the UI only ever talks to this interface.
export interface ThinkethApi {
  getTodayBrief(): Promise<BriefResponse>; // GET  /brief/today
  getDevelopment(id: string): Promise<DevelopmentDetailResponse>; // GET  /developments/:id
  sendFeedback(developmentId: string, kind: FeedbackKind): Promise<FeedbackResponse>; // POST /developments/:id/feedback
  selectDiagnostic(req: DiagnosticSelectRequest): Promise<DiagnosticSelectResponse>; // POST /diagnostics/select
  answerDiagnostic(questionId: string, answer: string): Promise<DiagnosticAnswerResponse>; // POST /diagnostics/:id/answer
  getKnowledge(): Promise<KnowledgeResponse>; // GET  /knowledge
  getConceptHistory(conceptId: string): Promise<ConceptHistoryResponse>; // GET  /knowledge/:conceptId/history
  ask(req: AskRequest): Promise<AskResponse>; // POST /ask
  visualize(req: LearningRequest): Promise<DiagramSpec>; // POST /visualize
  makeItStick(req: LearningRequest): Promise<MemoryAid>; // POST /make-it-stick
  createVoiceSession(): Promise<VoiceSession>; // POST /voice/session
  resetDemo(): Promise<void>; // POST /demo/reset
}

export const DEMO_USER_ID = "demo-user";
