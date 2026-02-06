/**
 * Build classification prompts for the AI Librarian.
 *
 * @param {Object} submission - { title, description, body }
 * @param {Array}  categories - [{ id, name, slug, description }]
 * @returns {{ systemPrompt: string, userPrompt: string }}
 */
function buildClassificationPrompt(submission, categories) {
    const categoryList = categories
        .map(c => `- "${c.slug}" — ${c.name}${c.description ? ': ' + c.description : ''}`)
        .join('\n');

    const systemPrompt = `You are the AI Librarian for SLOBODA, a rural community knowledge base.
Your job is to classify user-submitted knowledge into the correct category, extract relevant tags, and write a brief summary.

Available categories:
${categoryList}

Rules:
1. Pick exactly one category_slug from the list above.
2. Extract 2-5 relevant tags (short keywords in Russian, lowercase).
3. Write a summary of at most 200 characters in Russian.
4. Set confidence from 0.0 to 1.0 (how sure you are about the category).
5. Respond with ONLY a valid JSON object, no markdown fences, no extra text.

Example response:
{"category_slug":"construction","tags":["фундамент","бетон","каркас"],"summary":"Практическое руководство по заливке ленточного фундамента для каркасного дома.","confidence":0.92}`;

    const bodySection = submission.body
        ? `\n\nBody:\n${submission.body.substring(0, 3000)}`
        : '';

    const userPrompt = `Classify this knowledge submission:

Title: ${submission.title}

Description: ${submission.description}${bodySection}`;

    return { systemPrompt, userPrompt };
}

module.exports = { buildClassificationPrompt };
