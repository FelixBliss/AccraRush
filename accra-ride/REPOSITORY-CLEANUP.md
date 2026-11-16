# Accra Rush — Repository Cleanup Audit

Audit date: 2026-11-16  
Default branch: `master`

## Master source-tree cleanup

The current master tree contains only the Accra Rush game, its core contract tests, project documentation, package metadata, CI workflow, licence and Git configuration. The unrelated `rift-runners` project and standalone Dart learning files are not present in the current master tree.

Current top-level contents:
- `.github/workflows/core-tests.yml`
- `.gitignore`
- `LICENSE`
- `README.md`
- `accra-ride/`
- `package.json`

The historical folder name `accra-ride/` is retained temporarily to avoid breaking existing deployment paths and links. The in-game product title and package identity have been changed to **Accra Rush** / `accra-rush`.

## Branch inventory

There are currently 18 branches including `master`. The connected GitHub integration can inspect branches and commits but does not expose a branch-reference deletion operation. No branch was deleted or force-updated.

### Safe to delete after confirming no external deployment depends on them

These branches are strictly behind master and contain no commits ahead of it:
- `Code`
- `accraride/reverse-traffic-reset-control`
- `accraride/smart-traffic-emergency-braking`

### Retain temporarily for preservation/review

These branches contain commits or files not present on current master. Do not delete until their useful changes have either been deliberately integrated or explicitly discarded:
- `FelixBliss-patch-1` — unrelated Dart workflow change
- `accraride/branching-road-network` — road architecture notes and branch-road sandbox
- `accraride/combined-master-curved-prototype` — combined prototype
- `accraride/curved-master-speeds-environment` — road graph prototype and road notes
- `accraride/master-speed-recovery` — historical driving prototype revision
- `accraride/phase-0-player-collision-response` — historical collision prototype revision
- `accraride/production-graph-integration` — graph integration prototype and diagnostic
- `accraride/rear-impact-from-known-good-7533a00` — historical collision prototype revision
- `accraride/road-graph-curved-road-prototype` — road graph prototype
- `accraride/road-network-integration` — Corolla taxi GLB, road graph and branch-road prototypes
- `accraride/traffic-density-overtaking-collision-sweep` — historical traffic prototype revision
- `docs/accra-ride-technical-blueprint` — previous technical blueprint
- `fix/accra-ride-tight-gap-collisions` — historical collision prototype revision
- `fix/phase0-traffic-collisions-density` — historical traffic prototype revision

## Integration decision

Do not merge the old road-network integration branch wholesale. It has 49 commits ahead and 20 commits behind current master, so it has diverged. Its remaining unique files are experimental prototypes and the Corolla GLB. The Android reports for the road/traffic experiments were not accepted; they must be inspected and tested before any production integration.

## Verification

- The master core-contract GitHub Actions workflow completed successfully on the branding/CI update.
- This is a code-level test result, not Android gameplay verification.
- The master driving prototype remains the recoverable reference.
- No experimental road or camera prototype has been promoted to production.

## Manual branch deletion

To finish reducing the remote repository to one branch, open GitHub → **Branches**, then delete the three safe-to-delete branches above. The remaining experimental branches should be reviewed and deleted only after their unique assets/code are either preserved or deliberately rejected. Keep `master` as the only long-term branch once that review is complete.
