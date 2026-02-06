const Anthropic = require('@anthropic-ai/sdk');

let client = null;

function getClient() {
    if (!client) {
        if (!process.env.ANTHROPIC_API_KEY) {
            return null;
        }
        client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    return client;
}

/**
 * Call Claude API with system and user prompts.
 * @param {Object} params
 * @param {string} params.model - Model ID (e.g. 'claude-haiku-4-20250514')
 * @param {number} params.maxTokens - Max output tokens
 * @param {string} params.systemPrompt - System prompt
 * @param {string} params.userPrompt - User prompt
 * @returns {{ content: string, usage: { inputTokens: number, outputTokens: number } }}
 */
async function callClaude({ model, maxTokens, systemPrompt, userPrompt }) {
    const anthropic = getClient();
    if (!anthropic) {
        throw new Error('ANTHROPIC_API_KEY is not set. Cannot call Claude API.');
    }

    const response = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [
            { role: 'user', content: userPrompt }
        ]
    });

    const content = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('');

    const usage = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens
    };

    console.log(`[ai] Claude ${model} — ${usage.inputTokens} in / ${usage.outputTokens} out`);

    return { content, usage };
}

module.exports = { callClaude, getClient };
