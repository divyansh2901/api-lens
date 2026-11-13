import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, Lightbulb, MessageCircleQuestion, Send, Sparkles } from "lucide-react";
import { Button, Card, Input, LoadingState } from "./ui";
import { ApiError, apiRequest, rangeQuery } from "../services/api";
import type { TimeRange } from "../types/api";

interface Observation { category: string; title: string; fact: string; evidence: string }
interface Recommendation { action: string; rationale: string }
interface InsightData { range: TimeRange; generatedAt: string; executiveSummary: string; observations: Observation[]; possibleExplanations: string[]; recommendations: Recommendation[] }
interface AnswerData { range: TimeRange; answer: string; observedFacts: string[]; possibleExplanations: string[]; recommendations: string[] }

export default function AiObservatory({ projectId, range, token }: { projectId: string; range: string; token: string | null }) {
  const [insights, setInsights] = useState<InsightData | null>(null);
  const [insightLoading, setInsightLoading] = useState(false); const [insightError, setInsightError] = useState("");
  const [question, setQuestion] = useState(""); const [answer, setAnswer] = useState<AnswerData | null>(null);
  const [askLoading, setAskLoading] = useState(false); const [askError, setAskError] = useState("");
  const insightRequest = useRef(0); const askRequest = useRef(0);

  useEffect(() => {
    insightRequest.current += 1; askRequest.current += 1;
    setInsights(null); setAnswer(null); setInsightError(""); setAskError("");
    setInsightLoading(false); setAskLoading(false);
  }, [projectId, range, token]);

  async function generateInsights() {
    const current = ++insightRequest.current; setInsightLoading(true); setInsightError(""); setInsights(null);
    try { const result = await apiRequest<InsightData>(`/api/analytics/${encodeURIComponent(projectId)}/insights${rangeQuery(range)}`, {}, token); if (current === insightRequest.current) setInsights(result); }
    catch (error) { if (current === insightRequest.current) setInsightError(aiMessage(error)); }
    finally { if (current === insightRequest.current) setInsightLoading(false); }
  }

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!question.trim()) return;
    const current = ++askRequest.current; setAskLoading(true); setAskError(""); setAnswer(null);
    try { const result = await apiRequest<AnswerData>(`/api/analytics/${encodeURIComponent(projectId)}/ask${rangeQuery(range)}`, { method: "POST", body: JSON.stringify({ question: question.trim() }) }, token); if (current === askRequest.current) setAnswer(result); }
    catch (error) { if (current === askRequest.current) setAskError(aiMessage(error)); }
    finally { if (current === askRequest.current) setAskLoading(false); }
  }

  return <Card className="ai-card">
    <div className="ai-heading"><div className="ai-mark"><Sparkles size={20} /></div><div className="ai-title"><p className="eyebrow">GEMINI-POWERED, METRICS-GROUNDED</p><h2>Ask Observatory</h2></div><span className="ai-beta">AI FIELD NOTES</span></div>
    <p className="ai-intro">Get a clear read on your traffic, latency, and errors. Measured facts stay separate from possible explanations.</p>
    <div className="ai-actions"><Button onClick={() => void generateInsights()} busy={insightLoading}><Bot size={16} /> Generate project insights</Button><span>Uses aggregated analytics for this project and range.</span></div>
    {insightLoading && <div className="ai-loading"><LoadingState label="Gemini is reading the metrics" /></div>}
    {insightError && <div className="ai-error" role="alert"><strong>Insights are taking a breather.</strong><span>{insightError}</span><small>Check backend Gemini configuration and retry.</small></div>}
    {insights && <div className="insight-result"><div className="executive-summary"><span className="fact-label">OBSERVATORY SUMMARY</span><p>{insights.executiveSummary}</p><small>Generated {new Date(insights.generatedAt).toLocaleString()}</small></div>
      {insights.observations.length ? <div className="ai-columns"><section className="ai-observations"><h3><span className="fact-dot" /> Observed facts</h3>{insights.observations.map((item, index) => <article className="ai-fact" key={`${item.category}-${index}`}><b>{item.title}</b><p>{item.fact}</p><small>{item.evidence}</small></article>)}</section>
        <section className="ai-interpretations"><h3><Lightbulb size={15} /> Possible explanations</h3>{insights.possibleExplanations.length ? <ul>{insights.possibleExplanations.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="ai-quiet">No additional explanations were needed.</p>}
          <h3 className="recommendation-title"><Sparkles size={15} /> Try next</h3>{insights.recommendations.length ? <ul className="recommendation-list">{insights.recommendations.map((item, index) => <li key={index}><b>{item.action}</b><span>{item.rationale}</span></li>)}</ul> : <p className="ai-quiet">No recommendations for this range.</p>}</section></div>
        : <div className="ai-empty"><span>✳</span><div><b>No request data in this window.</b><p>Connect the SDK and persist a few requests to generate project insights.</p></div></div>}
    </div>}
    <div className="ask-divider"><span>OR ASK A QUESTION</span><i /></div>
    <form className="ask-form" onSubmit={ask}><label className="sr-only" htmlFor={`observatory-question-${projectId}`}>Ask about this project’s analytics</label><Input id={`observatory-question-${projectId}`} maxLength={500} minLength={3} value={question} onChange={event => setQuestion(event.target.value)} placeholder="Which endpoint is slowest, and what should I check?" /><Button type="submit" busy={askLoading} disabled={question.trim().length < 3}><Send size={15} /> Ask</Button></form>
    {askLoading && <div className="ask-loading"><LoadingState label="Checking the project metrics" /></div>}
    {askError && <div className="ai-error compact" role="alert"><strong>Couldn’t answer that yet.</strong><span>{askError}</span></div>}
    {answer && <article className="answer-card"><div className="answer-heading"><MessageCircleQuestion size={16} /><b>ANSWER</b></div><p>{answer.answer}</p>{answer.observedFacts.length > 0 && <div><span className="fact-label">OBSERVED FACTS</span><ul>{answer.observedFacts.map((fact, index) => <li key={index}>{fact}</li>)}</ul></div>}{answer.possibleExplanations.length > 0 && <div><span className="fact-label">POSSIBLE EXPLANATIONS</span><ul>{answer.possibleExplanations.map((fact, index) => <li key={index}>{fact}</li>)}</ul></div>}{answer.recommendations.length > 0 && <div><span className="fact-label">RECOMMENDATIONS</span><ul>{answer.recommendations.map((fact, index) => <li key={index}>{fact}</li>)}</ul></div>}</article>}
    <div className="ai-privacy">✳ ANALYTICS AGGREGATES ONLY <span>·</span> NO RAW REQUESTS OR DATABASE TOOLS</div>
  </Card>;
}

function aiMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 503) return "Gemini is not configured for this backend. Add GEMINI_API_KEY to backend/.env.";
  if (error instanceof ApiError && error.status === 429) return "The AI request limit is reached. Please wait before trying again.";
  if (error instanceof ApiError && error.status === 504) return "Gemini took too long to respond. Please retry.";
  return error instanceof Error ? error.message : "Unexpected AI service error.";
}
