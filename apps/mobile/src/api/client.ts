import type { DiagnosticQuestion, DiagramSpec, KnowledgeStateTransition, MemoryAid } from "@thinketh/contracts";
import type {
  AskRequest,
  AskResponse,
  DevelopmentDetailResponse,
  DiagnosticAnswerRequest,
  DiagnosticAnswerResponse,
  DiagnosticSelectRequest,
  FeedbackKind,
  FeedbackResponse,
  KnowledgeResponse,
  MakeItStickRequest,
  TodayResponse,
  VisualizeRequest,
  VoiceSession,
  VoiceSessionRequest,
} from "./types";

// One method per Thinketh endpoint. The UI only ever talks to this interface.
export interface ThinkethApi {
  getTodayBrief(): Promise<TodayResponse>; // GET  /brief/today
  getDevelopment(id: string): Promise<DevelopmentDetailResponse>; // GET  /developments/:id
  sendFeedback(developmentId: string, kind: FeedbackKind): Promise<FeedbackResponse>; // POST /developments/:id/feedback
  selectDiagnostic(req: Omit<DiagnosticSelectRequest, "userId">): Promise<DiagnosticQuestion>; // POST /diagnostics/select
  answerDiagnostic(questionId: string, req: Omit<DiagnosticAnswerRequest, "userId">): Promise<DiagnosticAnswerResponse>; // POST /diagnostics/:id/answer
  getKnowledge(): Promise<KnowledgeResponse>; // GET  /knowledge
  getConceptHistory(conceptId: string): Promise<KnowledgeStateTransition[]>; // GET  /knowledge/:conceptId/history
  ask(req: Omit<AskRequest, "userId">): Promise<AskResponse>; // POST /ask
  visualize(req: Omit<VisualizeRequest, "userId">): Promise<DiagramSpec>; // POST /visualize
  makeItStick(req: Omit<MakeItStickRequest, "userId">): Promise<MemoryAid>; // POST /make-it-stick
  createVoiceSession(req: Omit<VoiceSessionRequest, "userId">): Promise<VoiceSession>; // POST /voice/session
}

export const DEMO_USER_ID = "demo-user";
