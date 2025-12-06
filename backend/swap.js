const { decodeSuiPrivateKey } = require('@mysten/sui/cryptography');

// Senin attığın key:
const bech32Key = "suiprivkey1qpvg6z8rr962kj4t84fmw962g7228fkqsjxqzrce59s6z6f8aru4x45tcuv";

try {
    const decoded = decodeSuiPrivateKey(bech32Key);
    // Secret Key'i Base64 formatına çevir
    const base64Key = Buffer.from(decoded.secretKey).toString('base64');
    
    console.log("---------------------------------------------------");
    console.log("✅ .env dosyasına yapıştırman gereken SPONSOR_PRIVATE_KEY:");
    console.log(base64Key);
    console.log("---------------------------------------------------");
} catch (e) {
    console.error("Hata oluştu:", e);
}