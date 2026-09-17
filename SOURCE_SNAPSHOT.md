# Source snapshot

This private repository consolidates the local project source into one checkout. Component Git histories remain in the original repositories; this repository starts with a combined source snapshot.

| Component | Original repository | Local source commit |
| --- | --- | --- |
| Frontend | `tradersofafricateam/marketplace-v3-fe` | `e8b639844436e29738f3778b2500a1abf982804a` |
| Backend | `tradersofafricateam/marketplace-v3-be` | `f4508f7b2c360bc75cbd0549df820cd460b49a63` |
| Infrastructure | `tradersofafricateam/marketplace-v3-infra` | `794b5213c09ab423c5fa8cda3f3bef428ecbeb13` |

Readable working files were copied, including the updated infrastructure SSH public key in `repos/marketplace-v3-infra/tradersofafricateam/main.bicepparam` and the frontend technical documentation PDF. Component READMEs were refreshed to describe the source actually included here.

Some OneDrive-backed files were unavailable locally. Their indexed Git blobs supplied the source for nine frontend configuration/documentation files, seven backend configuration/workflow files, and four root infrastructure files (`README.md`, `main.bicep`, `main.bicepparam`, and `main.json`). Updated READMEs replace the recovered documentation.

The original infrastructure checkout reports a local change to its root `main.bicepparam`, but OneDrive would not supply that file's current contents. This snapshot therefore contains the indexed version at that path; the original unreadable working file was not overwritten. Recover and compare that file from OneDrive before relying on any unpublished root parameter changes. The readable nested parameter variant retains its local modification.

The backend's cached `origin/master` was eight commits ahead of its checked-out source. Those remote-only changes are not silently substituted into this local snapshot.

Dependency trees, generated builds, local credentials, caches, old release archives, and alternate legacy/integration working copies are excluded. Backend workflows are preserved in their component directory and do not automatically run from the combined repository root.
