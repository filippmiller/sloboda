const { callClaude } = require('./anthropic');
const { buildClassificationPrompt } = require('./prompts');

const MODEL = 'claude-haiku-4-20250514';
const MAX_TOKENS = 512;

// Claude Haiku pricing per million tokens
const INPUT_COST_PER_MILLION = 0.25;
const OUTPUT_COST_PER_MILLION = 1.25;

/**
 * Calculate cost in USD from token counts.
 */
function calculateCost(inputTokens, outputTokens) {
    return (inputTokens / 1_000_000) * INPUT_COST_PER_MILLION
         + (outputTokens / 1_000_000) * OUTPUT_COST_PER_MILLION;
}

/**
 * Parse a JSON response from Claude, stripping any markdown fences.
 */
function parseJSON(text) {
    // Strip markdown code fences if present
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }
    return JSON.parse(cleaned);
}

/**
 * Classify a knowledge submission using Claude Haiku.
 *
 * @param {number} submissionId
 * @param {Object} db - Database module (injected)
 * @returns {Object} Classification result
 */
async function classifyKnowledge(submissionId, db) {
    const startTime = Date.now();

    // 1. Fetch submission
    const submission = await db.getKnowledgeSubmissionById(submissionId);
    if (!submission) {
        throw new Error(`Submission ${submissionId} not found`);
    }

    // 2. Fetch categories
    const categories = await db.getCategories();
    if (categories.length === 0) {
        throw new Error('No categories found in database');
    }

    // 3. Build prompt
    const { systemPrompt, userPrompt } = buildClassificationPrompt(submission, categories);

    // 4. Call Claude
    let response;
    try {
        response = await callClaude({
            model: MODEL,
            maxTokens: MAX_TOKENS,
            systemPrompt,
            userPrompt
        });
    } catch (err) {
        // Log the API error and mark for manual review
        const processingTimeMs = Date.now() - startTime;
        await db.logAIProcessing({
            knowledgeSubmissionId: submissionId,
            model: MODEL,
            processingTimeMs,
            error: err.message
        });
        throw err;
    }

    const processingTimeMs = Date.now() - startTime;
    const cost = calculateCost(response.usage.inputTokens, response.usage.outputTokens);

    // 5. Parse JSON response
    let classification;
    try {
        classification = parseJSON(response.content);
    } catch (parseErr) {
        await db.logAIProcessing({
            knowledgeSubmissionId: submissionId,
            model: MODEL,
            promptTokens: response.usage.inputTokens,
            completionTokens: response.usage.outputTokens,
            totalCostUsd: cost,
            processingTimeMs,
            result: { raw: response.content },
            error: `JSON parse failed: ${parseErr.message}`
        });
        throw new Error(`Failed to parse AI response as JSON: ${parseErr.message}`);
    }

    // 6. Find matching category
    const matchedCategory = categories.find(c => c.slug === classification.category_slug);
    const aiCategoryId = matchedCategory ? matchedCategory.id : null;

    // Validate fields
    const tags = Array.isArray(classification.tags) ? classification.tags.slice(0, 10) : [];
    const summary = typeof classification.summary === 'string'
        ? classification.summary.substring(0, 500)
        : '';
    const confidence = typeof classification.confidence === 'number'
        ? Math.min(1, Math.max(0, classification.confidence))
        : 0;

    // 7. Update submission
    await db.updateKnowledgeSubmission(submissionId, {
        aiCategoryId,
        aiTags: tags,
        aiSummary: summary,
        aiConfidence: confidence,
        status: 'reviewing'
    });

    // 8. Log to ai_processing_log
    const logEntry = await db.logAIProcessing({
        knowledgeSubmissionId: submissionId,
        model: MODEL,
        promptTokens: response.usage.inputTokens,
        completionTokens: response.usage.outputTokens,
        totalCostUsd: cost,
        processingTimeMs,
        result: classification
    });

    console.log(`[ai] Classified submission #${submissionId} → ${classification.category_slug} (${(confidence * 100).toFixed(0)}%) in ${processingTimeMs}ms — $${cost.toFixed(6)}`);

    return {
        submissionId,
        categorySlug: classification.category_slug,
        categoryId: aiCategoryId,
        tags,
        summary,
        confidence,
        cost,
        processingTimeMs,
        logId: logEntry.id
    };
}

module.exports = { classifyKnowledge };
