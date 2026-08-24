import { selfTestAsistenteAccess } from "../src/config/asistenteAccess.selftest";

const result = selfTestAsistenteAccess();
if (!result.ok) {
  console.error("asistenteAccess self-test FAIL", result.errors);
  process.exit(1);
}
console.log("asistenteAccess self-test PASS");
