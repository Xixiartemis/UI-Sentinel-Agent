import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const pythonExe = path.join(root, "apps", "python-worker", ".venv", "Scripts", "python.exe");

if (!existsSync(pythonExe)) {
  console.error(`Python worker virtualenv not found: ${pythonExe}`);
  process.exit(1);
}

const code = `
from app.diagnosis import DiagnosisService, RuntimeEvidence
from app.schemas import (
    DiagnosisClaim,
    DiagnosisReport,
    FixSuggestion,
    RetrievalMatch,
    RetrievalQueryResponse,
    VerifierResult,
)

service = DiagnosisService(database_url="postgresql://offline-validation")
runtime_evidence = RuntimeEvidence(
    event_ids={"evt_dom", "evt_screenshot", "evt_network"},
    event_ids_by_type={
        "browser.dom_snapshot": ["evt_dom"],
        "browser.screenshot": ["evt_screenshot"],
        "browser.network": ["evt_network"],
    },
    artifact_ids={"artifact_screenshot"},
)
retrieval = RetrievalQueryResponse(
    project_id="project_1",
    query="LoginForm email password validation",
    rewritten_queries=["LoginForm email password validation"],
    matches=[
        RetrievalMatch(
            chunk_id="chunk_login_validation",
            file_path="src/validation/loginValidation.ts",
            start_line=1,
            end_line=14,
            chunk_type="validation",
            symbol_name="validateLoginForm",
            vector_score=0.0,
            keyword_score=1.0,
            final_score=0.4,
            content="if (!credentials.password.trim()) { errors.password = 'Password is required'; }",
        ),
        RetrievalMatch(
            chunk_id="chunk_login_form",
            file_path="src/components/LoginForm.tsx",
            start_line=1,
            end_line=79,
            chunk_type="component",
            symbol_name="LoginForm",
            vector_score=0.0,
            keyword_score=0.9,
            final_score=0.36,
            content="const nextErrors = validateLoginForm(credentials);",
        ),
    ],
)

report = service._mock_report(
    task_goal="Diagnose missing email required validation.",
    runtime_evidence=runtime_evidence,
    retrieval=retrieval,
)
report.verifier_result = service._verify(report, runtime_evidence, retrieval)
assert report.verifier_result.verified
assert len(report.claims) == 2
assert all(claim.evidence_ids for claim in report.claims)
assert report.fix_suggestions[0].file_path == "src/validation/loginValidation.ts"

unsupported = DiagnosisReport(
    summary="Unsupported report",
    severity="medium",
    claims=[DiagnosisClaim(text="Unsupported claim", evidence_ids=["missing_evidence"])],
    fix_suggestions=[FixSuggestion(file_path="src/validation/loginValidation.ts", suggestion="n/a")],
    verifier_result=VerifierResult(verified=False, unsupported_claims=[], missing_evidence=[]),
)
unsupported.verifier_result = service._verify(unsupported, runtime_evidence, retrieval)
assert not unsupported.verifier_result.verified
assert unsupported.verifier_result.unsupported_claims == ["Unsupported claim"]
assert unsupported.verifier_result.missing_evidence == ["missing_evidence"]

print("task8 offline diagnosis/verifier validation ok")
`;

const result = spawnSync(pythonExe, ["-c", code], {
  cwd: path.join(root, "apps", "python-worker"),
  encoding: "utf8",
  env: {
    ...process.env,
    PYTHONPATH: path.join(root, "apps", "python-worker"),
  },
});

if (result.stdout) {
  process.stdout.write(result.stdout);
}
if (result.stderr) {
  process.stderr.write(result.stderr);
}
process.exit(result.status ?? 1);
