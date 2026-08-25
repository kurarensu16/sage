/**
 * Utility to communicate with OpenRouter API for SAGE AI Guidance
 */

const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;

/**
 * Generates academic insights using OpenRouter LLM
 * @param {object} promptPayload 
 * @returns {Promise<string>}
 */
export async function getAiAcademicInsight(promptPayload) {
  if (!OPENROUTER_API_KEY) {
    throw new Error("VITE_OPENROUTER_API_KEY is not defined in the environment.");
  }

  const systemPrompt = `You are the SAGE AI Academic Advisor, an empathetic counseling assistant at Dr. Yanga's Colleges, Inc. (DYCI).
Context: The Philippine grading scale runs from 1.00 (highest/best) to 5.00 (failing), where 3.00 is passing and grades ≤ 2.00 qualify for honors.

Instructions:
- Speak directly to the student in second person ("You", "Your", or calling them by their first name).
- Provide 2-3 concise, encouraging, and actionable sentences.
- Never output internal thinking, reasoning steps, analysis, planning notes, or scratchpads.
- Output ONLY the final student counseling advice.`;

  let userPrompt;
  if (promptPayload.type === 'overall') {
    userPrompt = `Student: ${promptPayload.studentName}
Overall GWA: ${promptPayload.gwa} (${promptPayload.standing})
Honors Status: ${promptPayload.dlCategory} (${promptPayload.dlMessage})

Component Performance Diagnostic:
- Class Standing / Activities: ${promptPayload.diagnostics?.csAvg != null ? `${promptPayload.diagnostics.csAvg}%` : 'N/A'}
- Major Term Exams: ${promptPayload.diagnostics?.examAvg != null ? `${promptPayload.diagnostics.examAvg}%` : 'N/A'}
- Attendance Reliability: ${promptPayload.diagnostics?.attendanceRate != null ? `${promptPayload.diagnostics.attendanceRate}%` : 'N/A'}
- Character Rating: ${promptPayload.diagnostics?.charAvg != null ? `${promptPayload.diagnostics.charAvg}%` : 'N/A'}

Enrolled Subjects:
${promptPayload.subjects.map(s => `- ${s.code} (${s.name}): Grade ${s.periods?.semestralGrade?.gwa !== '—' ? s.periods.semestralGrade.gwa : 'Ongoing'}, Instructor ${s.instructor}`).join('\n')}

Provide encouraging, targeted academic advice addressing their specific strength and weakness areas.`;
  } else {
    userPrompt = `Student: ${promptPayload.studentName}
Course: ${promptPayload.subjectCode} (${promptPayload.subjectName}) - ${promptPayload.credits} Units
Instructor: ${promptPayload.instructor}
Period: ${promptPayload.periodLabel} (Rating: ${promptPayload.rating}%, GWA: ${promptPayload.gwa}, Status: ${promptPayload.status})

Component Diagnostic for this Course:
- Class Standing: ${promptPayload.courseCs != null ? `${promptPayload.courseCs}%` : 'N/A'}
- Term Exam: ${promptPayload.courseExam != null ? `${promptPayload.courseExam}%` : 'N/A'}

Provide targeted academic advice for this course.`;
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": window.location.origin,
        "X-Title": "SAGE Academic Portal"
      },
      body: JSON.stringify({
        model: "poolside/laguna-s-2.1:free",
        models: [
          "poolside/laguna-s-2.1:free",
          "cohere/north-mini-code:free"
        ],
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.2,
        max_tokens: 250
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content?.trim() || "";

    // Clean any tags
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    // Extract advice if preamble exists
    const preambleMatch = content.match(/(?:let'?s\s+craft|here\s+is\s+the\s+counseling|here\s+is\s+the\s+guidance|here\s+is\s+the\s+insight|final\s+advice|advice\s*:)\s*[:\-\n"]*\s*([\s\S]+)/i);
    if (preambleMatch && preambleMatch[1]) {
      content = preambleMatch[1].trim();
    }

    // Drop internal debate paragraphs
    if (content.toLowerCase().startsWith('student:') || content.toLowerCase().startsWith('we need to') || content.toLowerCase().startsWith('the student has') || content.toLowerCase().startsWith('here\'s a thinking') || content.toLowerCase().startsWith('wait the rule')) {
      const paragraphs = content.split('\n\n').filter(p => p.trim());
      if (paragraphs.length > 1) {
        content = paragraphs[paragraphs.length - 1].trim();
      }
    }

    // Strip surrounding quotes
    if ((content.startsWith('"') && content.endsWith('"')) || (content.startsWith('“') && content.endsWith('”'))) {
      content = content.slice(1, -1).trim();
    }

    return content;
  } catch (error) {
    console.error("OpenRouter API invocation failed:", error);
    throw error;
  }
}
