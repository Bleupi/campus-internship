// PROTOTYPE — temporarily mounts the design-system comparison (issue #5)
// in place of the real app shell, which doesn't exist yet. Revert once the
// prototype's decision is captured (see docs/agents/spec-pipeline.md).
import { PrototypeApp } from "./features/design-system-prototype/PrototypeApp";

export function App() {
  return <PrototypeApp />;
}
