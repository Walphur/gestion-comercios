import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const pubDer = publicKey.export({ type: "spki", format: "der" });
const privDer = privateKey.export({ type: "pkcs8", format: "der" });
const rawPub = pubDer.slice(-32);

console.log("LICENSE_PUBLIC_KEY_HEX=" + rawPub.toString("hex"));
console.log("LICENSE_PRIVATE_KEY_B64=" + privDer.toString("base64"));
