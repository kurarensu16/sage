import { supabase } from './supabase';

const BOUNDARY_STATEMENT = 'This guidance is advisory and does not alter your official institutional grade.';

const sanitizeMessage = (value, maxLength = 1200) => String(value || '').trim().slice(0, maxLength);

async function invokeAdvisor(body) {
  const { data, error } = await supabase.functions.invoke('invoke-advisor', { body });

  if (error) {
    throw new Error(error.message || 'Ask ASPIRE is temporarily unavailable.');
  }

  const response = data?.response;
  if (!response || typeof response.message !== 'string' || !response.message.trim()) {
    throw new Error('Ask ASPIRE returned an invalid response.');
  }

  if (response.boundary_statement !== BOUNDARY_STATEMENT) {
    throw new Error('Ask ASPIRE returned an unverified advisory response.');
  }

  return {
    message: sanitizeMessage(response.message),
    actions: Array.isArray(response.actions)
      ? response.actions.map(action => sanitizeMessage(action, 240)).filter(Boolean).slice(0, 3)
      : [],
    consultationRecommended: Boolean(response.consultation_recommended),
    boundaryStatement: response.boundary_statement
  };
}

/**
 * Generates a short explanation for a posted official milestone. The Edge
 * Function owns provider credentials and validates the structured response.
 */
export async function getAiAcademicInsight(promptPayload) {
  const result = await invokeAdvisor({
    mode: 'insight',
    context: promptPayload
  });
  return result.message;
}

/**
 * Handles states where calling a generative provider would add no value or
 * could imply a risk conclusion unsupported by student-visible evidence.
 */
export function getBoundedAdvisorResponse(question, context) {
  const advisor = context?.deterministicAdvisor;
  if (!advisor || !['no_evidence', 'no_enrollment', 'building_evidence'].includes(advisor.state)) {
    return null;
  }

  const normalizedQuestion = sanitizeMessage(question, 600).toLowerCase();
  const firstName = context?.student?.firstName || 'Student';
  const isGreeting = /^(hi|hello|hey|good\s+(morning|afternoon|evening))[!.?\s]*$/i.test(normalizedQuestion);
  const asksWhy = /\b(why|reason|identified|flagged)\b/i.test(normalizedQuestion);
  const asksWhat = /\b(what|next|first|do|work on|this week)\b/i.test(normalizedQuestion);

  if (advisor.state === 'no_enrollment') {
    return `Hi ${firstName}. No active course enrollment is available yet, so ASPIRE cannot evaluate academic evidence. Guidance will begin after your enrollment records are available.`;
  }

  if (advisor.state === 'no_evidence') {
    if (isGreeting) {
      return `Hi ${firstName}. I can explain your current ASPIRE status. Right now, no faculty-released activity result or official milestone grade is available, so I will not label you as academically at risk.`;
    }
    if (asksWhy) {
      return 'ASPIRE is waiting because no faculty-released activity result is available. Draft scores remain private, and no trend or risk conclusion should be made from records the student cannot verify.';
    }
    if (asksWhat) {
      return advisor.actions?.[0]?.description || 'Continue your coursework and review faculty feedback when an activity result is released.';
    }
    return 'The available student-visible records are not sufficient to confirm that. No released activity result or official milestone grade is currently available.';
  }

  if (isGreeting) {
    return `Hi ${firstName}. ASPIRE has one released result and is still building evidence. I can explain that result, but one activity alone is not enough to classify a trend.`;
  }
  if (asksWhy) return advisor.summary;
  if (asksWhat) return advisor.actions?.[0]?.description || advisor.summary;
  return `${advisor.summary} ${advisor.actions?.[0]?.description || ''}`.trim();
}

function getDeterministicFallback(context) {
  const advisor = context?.deterministicAdvisor;
  if (!advisor) {
    return 'Ask ASPIRE is temporarily unavailable. The available course records do not provide enough information to confirm that.';
  }

  const firstAction = advisor.actions?.[0]?.description;
  return [advisor.summary, firstAction].filter(Boolean).join(' ') || advisor.headline;
}

export async function getAskAspireResponse({ question, context, history = [] }) {
  const boundedResponse = getBoundedAdvisorResponse(question, context);
  if (boundedResponse) return boundedResponse;

  try {
    const result = await invokeAdvisor({
      mode: 'chat',
      question: sanitizeMessage(question, 600),
      context,
      history: history.slice(-6).map(message => ({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: sanitizeMessage(message.content)
      }))
    });
    return result.message;
  } catch (error) {
    console.warn('Ask ASPIRE server response failed; using deterministic fallback.', error);
    return getDeterministicFallback(context);
  }
}
