const { classifyKnowledge } = require('./classifier');

// In-process job queue
const jobs = [];
let processing = false;
let db = null;

const DELAY_BETWEEN_JOBS_MS = 2000;
const MAX_RETRIES = 1;

/**
 * Inject the database module. Must be called once at startup.
 */
function setDb(database) {
    db = database;
}

/**
 * Add a submission to the classification queue.
 * @param {number} submissionId
 */
function enqueue(submissionId) {
    if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('[ai-queue] ANTHROPIC_API_KEY not set — skipping classification for submission #' + submissionId);
        return;
    }

    jobs.push({ submissionId, retries: 0 });
    console.log(`[ai-queue] Enqueued submission #${submissionId} (queue size: ${jobs.length})`);
    processNext();
}

/**
 * Process the next job in the queue. Runs one at a time.
 */
async function processNext() {
    if (processing || jobs.length === 0) return;

    processing = true;
    const job = jobs.shift();

    console.log(`[ai-queue] Processing submission #${job.submissionId} (attempt ${job.retries + 1})`);

    try {
        if (!db) {
            throw new Error('Database not injected. Call setDb() before enqueuing.');
        }
        const result = await classifyKnowledge(job.submissionId, db);
        console.log(`[ai-queue] Completed submission #${job.submissionId} → ${result.categorySlug}`);
    } catch (err) {
        console.error(`[ai-queue] Failed submission #${job.submissionId}:`, err.message);

        if (job.retries < MAX_RETRIES) {
            job.retries++;
            jobs.push(job);
            console.log(`[ai-queue] Will retry submission #${job.submissionId} (attempt ${job.retries + 1})`);
        } else {
            console.error(`[ai-queue] Giving up on submission #${job.submissionId} after ${MAX_RETRIES + 1} attempts`);
            // Mark as needing manual review — do not crash
            try {
                if (db) {
                    await db.updateKnowledgeSubmission(job.submissionId, {
                        status: 'pending'
                    });
                }
            } catch (updateErr) {
                console.error(`[ai-queue] Failed to update submission #${job.submissionId} status:`, updateErr.message);
            }
        }
    }

    processing = false;

    // Process next job after delay
    if (jobs.length > 0) {
        setTimeout(processNext, DELAY_BETWEEN_JOBS_MS);
    }
}

module.exports = { enqueue, setDb };
