# Frozen reference engine

These files are a **verbatim copy** of the ITM engine from
[`isardmart/ultra_trail_run`](https://github.com/isardmart/ultra_trail_run) at commit
`c871419757a099c95c2957ff1463681e7f342157` (`src/lib/domain/`). The only change is the import path of
`database.types` (replaced by the local stub `database.types.ts`).

They exist only so that `test/golden.test.ts` can run the original engine and the package side by side and prove that,
with the default configuration and no modifiers, the outputs are identical. **Never edit them** — if the reference
behaviour has to change, that is a breaking change of the package (major version), and the copy should be refreshed
from the website repository in a dedicated commit.
