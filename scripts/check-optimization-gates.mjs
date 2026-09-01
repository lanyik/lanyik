import { access, readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const registerPath = resolve(root, "docs/optimization-gates.json");
const register = JSON.parse(await readFile(registerPath, "utf8"));
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));

assertExactKeys(register, ["schemaVersion", "decisions"], "optimization gate register");
if (register.schemaVersion !== 1) throw new Error(`unsupported optimization gate schema ${register.schemaVersion}`);
if (!Array.isArray(register.decisions) || register.decisions.length === 0) {
    throw new TypeError("optimization gate register must contain decisions");
}

const states = new Set(["deferred", "triggered", "approved", "implemented"]);
const operators = new Set([">", ">=", "<", "<=", "=="]);
const decisionIds = new Set();
for (const decision of register.decisions) {
    assertExactKeys(decision, [
        "id",
        "state",
        "ownerDocument",
        "measurementScript",
        "triggerMode",
        "triggerGroups",
        "approvalRequirements",
        "evidenceReferences",
        "decisionRecord"
    ], `optimization decision ${decision?.id ?? "<unknown>"}`);
    nonEmptyString(decision.id, "decision id");
    if (decisionIds.has(decision.id)) throw new Error(`duplicate optimization decision ${decision.id}`);
    decisionIds.add(decision.id);
    if (!states.has(decision.state)) throw new RangeError(`${decision.id} has invalid state ${decision.state}`);
    if (decision.triggerMode !== "any") throw new RangeError(`${decision.id} triggerMode must be any`);
    nonEmptyString(decision.ownerDocument, `${decision.id} ownerDocument`);
    nonEmptyString(decision.measurementScript, `${decision.id} measurementScript`);
    if (typeof packageJson.scripts?.[decision.measurementScript] !== "string") {
        throw new Error(`${decision.id} measurement script ${decision.measurementScript} is not in package.json`);
    }

    const ownerPath = resolveInsideRoot(decision.ownerDocument, `${decision.id} ownerDocument`);
    const ownerContents = await readFile(ownerPath, "utf8");
    const marker = `<!-- optimization-gate:${decision.id} -->`;
    if (!ownerContents.includes(marker)) {
        throw new Error(`${decision.ownerDocument} is missing ${marker}`);
    }

    if (!Array.isArray(decision.triggerGroups) || decision.triggerGroups.length === 0) {
        throw new TypeError(`${decision.id} must define at least one trigger group`);
    }
    for (const [groupIndex, group] of decision.triggerGroups.entries()) {
        assertExactKeys(group, ["all"], `${decision.id} trigger group ${groupIndex}`);
        if (!Array.isArray(group.all) || group.all.length === 0) {
            throw new TypeError(`${decision.id} trigger group ${groupIndex} must contain conditions`);
        }
        for (const [conditionIndex, condition] of group.all.entries()) {
            assertExactKeys(condition, ["metric", "operator", "threshold"], `${decision.id} condition ${conditionIndex}`);
            nonEmptyString(condition.metric, `${decision.id} condition metric`);
            if (!operators.has(condition.operator)) {
                throw new RangeError(`${decision.id} condition operator ${condition.operator} is invalid`);
            }
            if (typeof condition.threshold !== "number" && typeof condition.threshold !== "boolean") {
                throw new TypeError(`${decision.id} condition threshold must be numeric or boolean`);
            }
            if (typeof condition.threshold === "boolean" && condition.operator !== "==") {
                throw new TypeError(`${decision.id} boolean thresholds require ==`);
            }
            if (typeof condition.threshold === "number" && !Number.isFinite(condition.threshold)) {
                throw new RangeError(`${decision.id} numeric thresholds must be finite`);
            }
        }
    }

    if (!Array.isArray(decision.approvalRequirements) || decision.approvalRequirements.length === 0
        || decision.approvalRequirements.some(requirement => typeof requirement !== "string" || requirement.trim() === "")) {
        throw new TypeError(`${decision.id} must define non-empty approval requirements`);
    }
    if (!Array.isArray(decision.evidenceReferences)) {
        throw new TypeError(`${decision.id} evidenceReferences must be an array`);
    }
    const evidence = [];
    for (const reference of decision.evidenceReferences) {
        nonEmptyString(reference, `${decision.id} evidence reference`);
        if (!reference.endsWith(".json")) {
            throw new TypeError(`${decision.id} evidence references must be JSON documents`);
        }
        const evidencePath = resolveInsideRoot(reference, `${decision.id} evidence reference`);
        await access(evidencePath);
        evidence.push(await readEvidence(evidencePath, decision));
    }
    if (decision.decisionRecord !== null) {
        nonEmptyString(decision.decisionRecord, `${decision.id} decisionRecord`);
        if (!decision.decisionRecord.endsWith(".md")) {
            throw new TypeError(`${decision.id} decisionRecord must be Markdown`);
        }
        const decisionRecordPath = resolveInsideRoot(decision.decisionRecord, `${decision.id} decisionRecord`);
        if (!(await stat(decisionRecordPath)).isFile()) {
            throw new TypeError(`${decision.id} decisionRecord must be a file`);
        }
    }

    if (decision.state === "deferred") {
        if (decision.evidenceReferences.length !== 0 || decision.decisionRecord !== null) {
            throw new Error(`${decision.id} cannot attach approval evidence while still deferred`);
        }
    } else if (decision.evidenceReferences.length === 0) {
        throw new Error(`${decision.id} state ${decision.state} requires evidenceReferences`);
    } else if (!evidence.some(sample => meetsTrigger(decision, sample.measurements))) {
        throw new Error(`${decision.id} state ${decision.state} requires evidence that meets a trigger group`);
    } else if (["approved", "implemented"].includes(decision.state) && decision.decisionRecord === null) {
        throw new Error(`${decision.id} state ${decision.state} requires a decisionRecord`);
    }
}

const stateCounts = new Map();
for (const decision of register.decisions) {
    stateCounts.set(decision.state, (stateCounts.get(decision.state) ?? 0) + 1);
}
const stateSummary = [...stateCounts]
    .map(([state, count]) => `${state}=${count}`)
    .join(", ");
console.log(`verified ${register.decisions.length} optimization gates (${stateSummary})`);

function assertExactKeys(value, expected, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError(`${label} must be an object`);
    }
    const actual = Object.keys(value).sort();
    const allowed = [...expected].sort();
    if (actual.length !== allowed.length || actual.some((key, index) => key !== allowed[index])) {
        throw new TypeError(`${label} keys must be exactly: ${allowed.join(", ")}`);
    }
}

function nonEmptyString(value, label) {
    if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} must be a non-empty string`);
}

function resolveInsideRoot(relativePath, label) {
    if (isAbsolute(relativePath)) throw new RangeError(`${label} must be repository-relative`);
    const target = resolve(root, relativePath);
    const repositoryRelative = relative(root, target);
    if (repositoryRelative === "" || repositoryRelative === ".."
        || repositoryRelative.startsWith(`..${sep}`)
        || isAbsolute(repositoryRelative)) {
        throw new RangeError(`${label} must stay inside the repository`);
    }
    return target;
}

async function readEvidence(evidencePath, decision) {
    const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
    assertExactKeys(evidence, [
        "schemaVersion",
        "gateId",
        "capturedAt",
        "measurementContext",
        "measurements",
        "artifactReferences"
    ], `${decision.id} evidence`);
    if (evidence.schemaVersion !== 1) throw new Error(`${decision.id} evidence schema must be 1`);
    if (evidence.gateId !== decision.id) throw new Error(`${decision.id} evidence gateId does not match`);
    nonEmptyString(evidence.capturedAt, `${decision.id} evidence capturedAt`);
    const capturedAt = new Date(evidence.capturedAt);
    if (!Number.isFinite(capturedAt.valueOf()) || capturedAt.toISOString() !== evidence.capturedAt) {
        throw new TypeError(`${decision.id} evidence capturedAt must be a canonical UTC ISO timestamp`);
    }
    nonEmptyString(evidence.measurementContext, `${decision.id} evidence measurementContext`);
    if (!evidence.measurements || typeof evidence.measurements !== "object"
        || Array.isArray(evidence.measurements) || Object.keys(evidence.measurements).length === 0) {
        throw new TypeError(`${decision.id} evidence measurements must be a non-empty object`);
    }
    for (const [metric, value] of Object.entries(evidence.measurements)) {
        nonEmptyString(metric, `${decision.id} evidence metric`);
        if (typeof value !== "boolean" && (typeof value !== "number" || !Number.isFinite(value))) {
            throw new TypeError(`${decision.id} evidence metric ${metric} must be finite or boolean`);
        }
    }
    if (!Array.isArray(evidence.artifactReferences) || evidence.artifactReferences.length === 0) {
        throw new TypeError(`${decision.id} evidence must reference at least one raw artifact`);
    }
    for (const reference of evidence.artifactReferences) {
        nonEmptyString(reference, `${decision.id} evidence artifact reference`);
        const artifactPath = resolveInsideRoot(reference, `${decision.id} evidence artifact reference`);
        if (artifactPath === evidencePath) {
            throw new Error(`${decision.id} evidence cannot cite itself as a raw artifact`);
        }
        await access(artifactPath);
    }
    return evidence;
}

function meetsTrigger(decision, measurements) {
    return decision.triggerGroups.some(group => group.all.every(condition => {
        const value = measurements[condition.metric];
        if (typeof value !== typeof condition.threshold) return false;
        switch (condition.operator) {
            case ">": return value > condition.threshold;
            case ">=": return value >= condition.threshold;
            case "<": return value < condition.threshold;
            case "<=": return value <= condition.threshold;
            case "==": return value === condition.threshold;
            default: throw new RangeError(`unsupported operator ${condition.operator}`);
        }
    }));
}
