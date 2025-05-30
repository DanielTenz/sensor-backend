import { insertSensorReading, getLatestReadings } from '../services/sensorService.js';
import { hashSecret } from '../utils/auth.js';
import { SECRET_KEY } from '../config/app.js';
import { SensorForm, sensorFormStyles } from '../components/SensorForm.js';

// Custom error class for sensor-related errors
class SensorError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.name = 'SensorError';
        this.statusCode = statusCode;
    }
}

// Validate sensor reading input
const validateSensorReading = (sensorId, humidity, temperature) => {
    if (!sensorId || typeof sensorId !== 'string') {
        throw new SensorError('Invalid sensor ID format', 400);
    }
    if (humidity === undefined || humidity === null) {
        throw new SensorError('Humidity value is required', 400);
    }
    if (temperature === undefined || temperature === null) {
        throw new SensorError('Temperature value is required', 400);
    }
    if (isNaN(Number(humidity)) || isNaN(Number(temperature))) {
        throw new SensorError('Sensor values must be numbers', 400);
    }
};

export const submitSensorReading = async(req, res) => {
    try {
        const { sensorId, humidity, temperature, secret } = req.body;

        // Verify the secret matches the expected hash
        const expectedHash = hashSecret(SECRET_KEY);
        const providedHash = hashSecret(secret);

        if (providedHash !== expectedHash) {
            throw new SensorError('Unauthorized access', 403);
        }

        // Validate input
        validateSensorReading(sensorId, humidity, temperature);

        // Insert the reading using the service
        const result = await insertSensorReading(sensorId, humidity, temperature);

        if (!result.success) {
            throw new SensorError('Failed to insert sensor reading', 500);
        }

        res.json({
            success: true,
            id: result.id,
            message: 'Sensor reading recorded successfully'
        });
    } catch (error) {
        console.error('Sensor reading error:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });

        if (error instanceof SensorError) {
            return res.status(error.statusCode).json({
                error: error.message,
                type: error.name
            });
        }

        res.status(500).json({
            error: 'Internal server error',
            message: 'An unexpected error occurred while processing the sensor reading: ' + error.message
        });
    }
};

// Helper function to escape HTML (prevents XSS)
const escapeHtml = (unsafe) => {
    if (!unsafe) return '';
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
};

export const getSensorReadings = async(req, res) => {
        try {
            // Get the readings using the service
            const readings = await getLatestReadings(100);

            if (!readings) {
                throw new SensorError('Invalid response from database', 500);
            }

            const tableRows = readings.map(row => `
            <tr>
                <td>${escapeHtml(row.id)}</td>
                <td>${escapeHtml(row.sensor_id)}</td>
                <td>${escapeHtml(row.humidity)}</td>
                <td>${escapeHtml(row.temperature)}</td>
                <td>${escapeHtml(row.timestamp)}</td>
            </tr>
        `).join('');

            const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Sensor Readings</title>
                <style>
                    body { font-family: sans-serif; margin: 2rem; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 2rem; }
                    th, td { padding: 8px 12px; border: 1px solid #ddd; }
                    th { background-color: #f4f4f4; }
                    tr:nth-child(even) { background-color: #f9f9f9; }
                    ${sensorFormStyles}
                </style>
            </head>
            <body>
                <h1>Sensor Readings Dashboard</h1>
                
                ${SensorForm()}

                <h2>Latest Sensor Readings</h2>
                ${readings.length === 0 ? '<p>No sensor readings available.</p>' : `
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Sensor ID</th>
                                <th>Humidity</th>
                                <th>Temperature</th>
                                <th>Timestamp</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                    </table>
                `}
            </body>
            </html>
        `;

        res.send(html);

    } catch (error) {
        console.error('Error retrieving sensor readings:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });

        if (error instanceof SensorError) {
            return res.status(error.statusCode).send(`
                <!DOCTYPE html>
                <html>
                <head><title>Error</title></head>
                <body>
                    <h1>Error retrieving sensor readings</h1>
                    <p>${escapeHtml(error.message)}</p>
                </body>
                </html>
            `);
        }

        res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head><title>Error</title></head>
            <body>
                <h1>Error retrieving sensor readings</h1>
                <p>An unexpected error occurred while retrieving sensor readings.</p>
            </body>
            </html>
        `);
    }
};