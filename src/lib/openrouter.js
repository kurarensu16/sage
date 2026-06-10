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

  const systemPrompt = `You are the SAGE AI Academic Advisor, an empathetic, highly intelligent counseling assistant at a premium university (DYCI).
Your task is to analyze the student's academic performance records and output a highly personalized, constructive, actionable, and encouraging insight.
Guidelines:
- Speak directly to the student in second person ("You", "Your").
- Keep your feedback concise (2-4 sentences max).
- Combine analysis of the numbers (GWA, ratings, units) with pedagogical advice (e.g. study habits, time management, targeting honors, seeking help if failing).
- Do not use generic placeholders. Refer to specific subjects, grades, and targets.
- Output ONLY the raw insight text without any markdown wrappers or quotes.`;

  let userPrompt = "";
  if (promptPayload.type === 'overall') {
    userPrompt = `Student Name: ${promptPayload.studentName}
Overall GWA: ${promptPayload.gwa}
Standing: ${promptPayload.standing}
Honors Category: ${promptPayload.dlCategory} (Probability: ${promptPayload.dlProbability}%)
Honors Message: ${promptPayload.dlMessage}

Subjects & Grades:
${promptPayload.subjects.map(s => `- ${s.code} (${s.name}): Credits ${s.credits}, Instructor ${s.instructor}, Semestral Grade status: ${s.periods?.semestralGrade?.gwa !== '—' ? s.periods.semestralGrade.gwa : 'Ongoing'}`).join('\n')}

Provide an overall academic trajectory review and guidance for this student.`;
  } else {
    userPrompt = `Student Name: ${promptPayload.studentName}
Course: ${promptPayload.subjectCode} - ${promptPayload.subjectName} (${promptPayload.credits} Units)
Instructor: ${promptPayload.instructor}
Selected Grading Period: ${promptPayload.periodLabel}
Current Period Rating: ${promptPayload.rating}%
Current Period GWA: ${promptPayload.gwa}
Period Status: ${promptPayload.status}

Other milestones for this course:
- Prelim: ${promptPayload.allPeriods.prelim?.gwa || '—'}
- Midterm: ${promptPayload.allPeriods.midterm?.gwa || '—'}
- Midterm Rating: ${promptPayload.allPeriods.midtermRating?.gwa || '—'}
- Semi-Final: ${promptPayload.allPeriods.semiFinal?.gwa || '—'}
- Final: ${promptPayload.allPeriods.final?.gwa || '—'}
- Semestral Grade: ${promptPayload.allPeriods.semestralGrade?.gwa || '—'}

Provide a highly targeted academic insight for the student regarding this specific course and grading period.`;
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
        model: "google/gemini-2.5-flash", // Fast and cost-efficient
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 250
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || "";
  } catch (error) {
    console.error("OpenRouter API invocation failed:", error);
    throw error;
  }
}
