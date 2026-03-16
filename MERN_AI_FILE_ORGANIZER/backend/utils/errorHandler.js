const logger = require('./logger');

// Placeholder for Sentry
const Sentry = {
    captureException: (err) => {
        // In real implementation: Sentry.captureException(err);
        logger.error(`[Sentry Placeholder] Captured Exception: ${err.message}`);
    },
    init: (dsn) => {
        logger.info(`[Sentry Placeholder] Initialized with DSN: ${dsn}`);
    }
};

function initErrorHandler() {
    process.on('uncaughtException', (error) => {
        console.error(`Uncaught Exception: ${error.message}`); // Ensure capture by Main
        logger.error(`Uncaught Exception: ${error.message}`);
        Sentry.captureException(error);
        process.exit(1); // Exit to Trigger Restart via Heartbeat
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error(`Unhandled Rejection: ${reason}`); // Ensure capture by Main
        logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
        Sentry.captureException(reason);
    });

    Sentry.init("https://examplePublicKey@o0.ingest.sentry.io/0"); // Mock DSN
}

module.exports = { initErrorHandler, Sentry };
