const crypto = require('crypto');

if (!process.env.ENCRYPTION_KEY) {
    console.error('[FATAL] ENCRYPTION_KEY environment variable is not set. Refusing to start.');
    process.exit(1);
}

if (!/^[0-9a-fA-F]{64}$/.test(process.env.ENCRYPTION_KEY)) {
    console.error('[FATAL] ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). Refusing to start.');
    process.exit(1);
}

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
const IV_LENGTH = 12; // 96-bit IV recommended for GCM

/**
 * Encrypt with AES-256-GCM.
 * Output format: "gcm:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>"
 */
function encrypt(text) {
    if (!text) return text;
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `gcm:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt — supports both GCM (new) and legacy CBC (old) ciphertexts.
 * GCM format:  "gcm:<iv>:<tag>:<ciphertext>"
 * Legacy CBC:  "<iv>:<ciphertext>"
 */
function decrypt(text) {
    if (!text) return text;
    try {
        if (text.startsWith('gcm:')) {
            // AES-256-GCM path
            const parts = text.split(':');
            if (parts.length !== 4) throw new Error('Invalid GCM ciphertext format');
            const [, ivHex, tagHex, ctHex] = parts;
            const iv = Buffer.from(ivHex, 'hex');
            const tag = Buffer.from(tagHex, 'hex');
            const ct = Buffer.from(ctHex, 'hex');
            const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
            decipher.setAuthTag(tag);
            return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
        } else {
            // Legacy AES-256-CBC path — kept only for reading old stored values
            if (!text.includes(':')) return text;
            const parts = text.split(':');
            const iv = Buffer.from(parts.shift(), 'hex');
            const ct = Buffer.from(parts.join(':'), 'hex');
            const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
            return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
        }
    } catch (e) {
        console.error('[crypto] Decryption failed — key mismatch or corrupted ciphertext:', e.message);
        return '';
    }
}

module.exports = { encrypt, decrypt };
