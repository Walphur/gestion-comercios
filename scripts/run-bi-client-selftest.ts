import { selfTestIaPayload } from "../src/db/intelligence/iaPayload.selftest";
import { selfTestIaValidation } from "../src/db/intelligence/iaValidation.selftest";

async function main() {
  const payload = selfTestIaPayload();
  if (!payload.ok) {
    console.error("iaPayload self-test FAIL", payload.errors);
    process.exit(1);
  }

  const validation = await selfTestIaValidation();
  if (!validation.ok) {
    console.error("iaValidation self-test FAIL", validation.errors);
    process.exit(1);
  }

  console.log("Client IA self-tests PASS");
}

void main();
