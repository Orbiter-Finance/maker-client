import crypto from "crypto";
export function encryptPrivateKey(privateKey: string, passphrase: string) {
  const algorithm = "aes-256-cbc";
  const salt = crypto.randomBytes(32);
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const cipher = crypto.createCipheriv(algorithm, key, iv);

  let encryptedPrivateKey = cipher.update(privateKey, "utf8", "hex");
  encryptedPrivateKey += cipher.final("hex");

  return {
    encryptedPrivateKey,
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
  };
}

export function decryptPrivateKey(
  encryptedPrivateKey: string,
  passphrase: string,
  salt: string,
  iv: string
) {
  const algorithm = "aes-256-cbc";
  const key = crypto.scryptSync(passphrase, Buffer.from(salt, "hex"), 32);
  const decipher = crypto.createDecipheriv(
    algorithm,
    key,
    Buffer.from(iv, "hex")
  );
  let decryptedPrivateKey = decipher.update(encryptedPrivateKey, "hex", "utf8");
  decryptedPrivateKey += decipher.final("utf8");
  return decryptedPrivateKey;
}

const privateKey = "the is privateKey";

const passphrase = "my_secret_passphrase";

const encryptedData = encryptPrivateKey(privateKey, passphrase);
console.log("Encrypted Data:", encryptedData);

const decryptedData = decryptPrivateKey(
  encryptedData.encryptedPrivateKey,
  passphrase,
  encryptedData.salt,
  encryptedData.iv
);
console.log("Decrypted Private Key:", decryptedData);
