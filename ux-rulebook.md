# The Rulebook — agreed rules & exceptions

_Project:_ `@toghen/figma`
_Last updated:_ 2026-10-22

## Rules

> Every rule names all four parts. No reason, no rule.
> A reason is only: a real all-day-user need, or consistency with another rule.

### R1 — One scroll region per axis
- **Spot:** any pane body.
- **What it's for:** a pane's own controls and content.
- **Limit:** a pane may scroll; nothing inside it may introduce a second vertical
  scroll region.
- **Reason:** the Activity log was a 200px scroll region inside a scrolling
  `main` (smell #5). Rows below the inner fold were unreachable without noticing
  there were two scrollbars.

### R2 — Results go to the shared surface
- **Spot:** anything a command produces: plan rows, progress, outcome.
- **What it's for:** telling the user what a command did.
- **Limit:** no pane renders its own plan, progress or result. One region, one
  renderer.
- **Reason:** duplicating the apparatus per tab is exactly what lost the Mappings
  progress bar and result summary, so Execute Scaffold reported nothing at all
  (smell #9). A second copy is a second thing to keep complete.

### R3 — A control lives with what it changes
- **Spot:** any setting that modifies a command.
- **What it's for:** configuring a command before it runs.
- **Limit:** it sits in the pane that owns the command, never in the result
  surface.
- **Reason:** Dry run modified Execute from two sections away, inside a region that otherwise only reports (smell #7). Being in a per-pane region forced a second copy of the same toggle.
- **Postscript:** applying this rule killed its own example. Once Dry run sat
  beside Plan and Execute it was plainly a third way to say "show me without
  doing it", and it was removed. Placement made the redundancy visible.

### R4 — A reported problem is separable at a glance
- **Spot:** rows in the result surface.
- **What it's for:** one operation's outcome.
- **Limit:** a row reporting a problem carries a distinct marker, and its message
  is readable rather than truncated.
- **Reason:** a warning buried in eighty identical-looking skips is a warning
  nobody reads. Drift detection shipped and stayed invisible for a full round
  because rows showed only a path.

### R5 — Section chrome must be earned
- **Spot:** collapsible sections.
- **What it's for:** hiding content the user is not currently using.
- **Limit:** a section is warranted only when its content is taller than its own
  header.
- **Reason:** three sections paid ~48px of header to house ~40px of content
  (smell #2). Collapsing exists to save room; at that ratio it costs room.

### R6 — A plan names itself
- **Spot:** the result surface header.
- **What it's for:** identifying what is being shown.
- **Limit:** when showing a plan, it says which command produced it.
- **Reason:** `planType` is computed and used only to enable a button; the user
  infers which plan they are reading from which button lit up, two sections away
  (smell #6). With one shared surface and four commands feeding it, inference
  stops being possible at all.

### R7 — The tab strip takes a new pane without redesign
- **Spot:** the tab strip.
- **What it's for:** choosing which working area is in front.
- **Limit:** labels must not truncate or wrap at the minimum window width with
  one more pane than currently exists.
- **Reason:** panes are expected to be added, and two of the three have already grown past what they held when the strip was drawn. A strip that breaks on the fourth pane forces a redesign at the moment nobody wants one.

### R8 — Two states, and they look different
- **Spot:** the Load pane; and, with nothing loaded, the tabs of the panes that
  need a document (Sync, Tokens, Selection).
- **What it's for:** getting a design system into view: what it is made of, the
  files it reads and how they combine.
- **Limit:** with nothing loaded, show one way in and nothing else. Inert
  controls are not displayed.
- **Reason:** an unloaded plugin used to show Variables, Styles and Activity,
  all disabled. A user cannot tell "not applicable yet" from "broken".
- **Amended 22 October 2026, with the maintainer's sign-off:** the spot moved
  from *the Design System pane* to *the Load pane* when that pane was split in
  two. The limit and the reason are unchanged; the commands it used to hide
  went to the Sync pane, whose tab is inert with nothing loaded.

### R9 — A state the screen depends on is answered, not inferred
- **Spot:** any payload the UI branches on.
- **What it's for:** telling the UI which of two screens to show.
- **Limit:** the answer is carried explicitly. The UI never infers it from a
  placeholder value, a zero count, or the mere arrival of a message.
- **Reason:** `GET_DOCUMENT_STATE` replied with `name: 'Untitled'` and `tokenCount: 0` when nothing was loaded, and the UI took any reply as proof of a document (smell #17). R8 was written, agreed, and implemented while the empty state it describes was unreachable, because the condition it turns on could not be expressed. `loaded: false` is now part of the payload.

### R10 — A choice made for the user is shown to the user
- **Spot:** any command that must pick between several valid options to proceed.
- **What it's for:** completing an operation that has more than one sensible answer.
- **Limit:** the option in force is on screen before the command runs. Reporting
  it afterwards does not count.
- **Reason:** Export writes one mode of a multi-mode document. It picked the default silently and named the omitted modes in a toast after the file had downloaded (smell #20). By then the choice was already made and the wrong file was already on disk. The handler had accepted a `mode` all along.
- **Corollary:** where there is only one option there is no choice, and the
  control is hidden rather than shown disabled (R5, R8).

### R11 — A status claims only what it can check
- **Spot:** any standing summary of state: badges, status lines, counts.
- **What it's for:** telling the user where things stand.
- **Limit:** the words name what was actually observed. A summary may not read
  as an all-clear unless something has checked and found one. Where a stronger
  answer exists elsewhere on screen, the summary carries it rather than
  contradicting it.
- **Reason:** a green dot reading "Synced · 52 of 52 tokens" sat directly above a plan reporting `4 drifted` (smell #22). The count was true (the file holds a record for all 52), but "Synced" is a claim that everything agrees, and the record cannot know that. The confident-looking region was the wrong one, which is the worst arrangement available: a status nobody can trust is worse than no status.
- **How it was met:** "Synced" became a dated event rather than a state (`Synced 11 Aug 2026, 17:11`), the count says `recorded` rather than `synced`, and drift is appended with an amber dot. Two things can look for drift now, a sync plan and the Inspector, so the note takes the **more recent** of the two and names it: `2 drifted (inspected 20:50)`. The only all-clear the pane gives, `no drift`, appears when something has just looked and found none. Since the record moved onto each variable and style as a stamp, which holds no time, the event reads `Written by a sync` rather than a date: still an event, not a state.

### R12 — Truncate from the least important end, or do not truncate
- **Spot:** any single-line summary that can overflow.
- **What it's for:** fitting a variable-length summary into fixed space.
- **Limit:** ellipsising from the right is allowed only when the rightmost
  content is the least important. Otherwise the content wraps, or the layout
  gives it a row of its own.
- **Reason:** the result header ellipsised its counts, and the counts end with `drifted` and `warnings`, so it reliably hid the two numbers a user most needs (smell #24). Which end is safe to cut is a property of the content, not of the layout.

### R13 — An error names the fault, not the symptom
- **Spot:** any message shown when a command fails.
- **What it's for:** telling the user what went wrong and what to do next.
- **Limit:** when a check fails for a reason the check itself cannot see, the
  message says the real reason. A message that is technically true but points at
  the wrong fix does not count as having told the user.
- **Reason:** loading an exported token file reported *"Resolver document must declare a `version` field"* (smell #29). True, and it sent the reader looking for a field to add. But DTCG token files define no `version`, so there is nothing to add. The file was a different format, not a resolver document with something missing. The plugin's own export is the file a user is most likely to try, which makes it the case worth naming rather than the obscure one.

### R14 — One thing that happened is one row
- **Spot:** the result surface.
- **What it's for:** reporting what a command found or did.
- **Limit:** an event produces one row. Detail about it belongs *in* that row, not beside it as a second entry. A count is not reported twice under two names.
- **Reason:** a drifted token emitted a `WARNING` explaining it and a `SKIP`
  recording it, so four drifted tokens filled eight rows and the summary read
  `4 drifted · 4 warnings` for one set of four (smell #28). Neither row was
  wrong on its own, which is why it survived a walk; the doubling is only
  visible at scale.
- **Where it is enforced:** in what the *plan emits*, not in the renderer. A
  renderer that merged pairs back together would be guessing which rows belong
  to each other.

### R15 — The result surface holds what a command produced, not what is
- **Spot:** the shared result surface, and any pane showing a standing picture
  of state.
- **What it's for:** the surface reports the output of a command (plan rows, progress, outcome). A description of how things stand belongs to the pane whose subject it is.
- **Limit:** a standing picture is drawn in its pane and survives every command
  run from anywhere else. It never goes to the surface.
- **Reason:** R2 says results go to the shared surface, and read carelessly that swallows the Inspector's whole tree. It must not: whatever ran last replaces the surface, so pressing Plan in another pane would silently throw the picture away. The two regions answer different questions, *what did I just do* and *where do things stand*, and only one of them is allowed to be transient.
- **Corollary:** a standing picture says **when it was taken**, and offers to
  take another. A command's output is true of the moment it ran and is replaced
  when something else runs; a picture stays on screen while the thing it
  describes moves underneath it (R11).

### R16 — A summary of unmeasured things does not say they are fine
- **Spot:** any rolled-up count: a group summary, a header tally, a badge.
- **What it's for:** saying what is in a region without opening it.
- **Limit:** items nothing has checked are counted apart, in their own words.
  They are never folded into the reassuring number.
- **Reason:** a closed group holding one style-backed token read `1 clean` (smell #32). Style comparison is not built, so nothing had looked at it, and the summary said it was fine in the one place a reader is least likely to open and find out. This is R11 applied to aggregates, where it is easier to break: a total is written once and read as though everything in it was examined.
- **How it was met:** a quiet group reads `2 clean · 1 not inspected`, and the
  Inspector's header carries `n backed by Figma styles, not compared yet` on its
  own line rather than inside the counts.

## Exceptions allowed

> A builder asked to break a rule; the sign-off allowed it.
> If it's made general, update the rule above instead of leaving it here.

### The status bar carries two controls — *pending sign-off*
- **Spot:** the status bar.
- **What it's for:** the plugin's own condition, plus the two things that are
  about the plugin itself rather than the design system: the command line's
  connection and the switch between the window's two sizes.
- **Limit:** those two and nothing else. The connection is a dot and the time
  it was made, never a word claiming it is there now (R11); the switch is one
  icon button. Nothing about the design system, and no command.
- **Reason:** consistency with the map's split between the plugin and the
  design system. The window's size and the socket are not any pane's subject,
  so putting them in a pane would make that pane own something it is not about
  (R3), and the status bar is the one region always on screen. The map's own
  row for the status bar had said "nothing more" than busy or failed; this
  widens it, which is why it waits for sign-off.

### Not exceptions, checked
- **The Selection pane's one-click Bind** acts from a standing picture, which
  R15 allows as long as what the command produces goes to the result surface.
  It does: the Bind plans the one binding, the plan replaces what the surface
  showed, and its Execute follows and reports there too.
- **The Tokens browser's horizontal scroll** is the pane's one horizontal
  region, and appears only when even one column does not fit, so R1 holds per
  axis.
