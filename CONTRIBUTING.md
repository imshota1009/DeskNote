# Contributing to DeskNote

Thank you for your interest in contributing to DeskNote! 📝🗓️

## How to Contribute

### Reporting Bugs
1. Check the [Issues](https://github.com/imshota1009/DeskNote/issues) page to see if the bug has already been reported.
2. If not, open a new issue.
3. Provide as much detail as possible — browser, OS, device (tablet / phone / desktop), steps to reproduce, and screenshots if applicable.
4. **Never include a real note ID or the contents of a note in an issue.** Anyone who reads the ID can open that note.

### Suggesting Features
1. Open a new issue to suggest a feature.
2. Describe the feature clearly and explain how it improves everyday use (e.g. a new view, a reminder, a way to sort plans).

### Submitting Code Changes
1. Fork the repository.
2. Create a new branch: `git checkout -b feature/your-feature-name`
3. Make your changes and test them locally with `npx serve public`.
4. Commit with a clear message: `git commit -m "Add: description of change"`
5. Push to your fork: `git push origin feature/your-feature-name`
6. Open a Pull Request against the `main` branch.

## Code Style & Development
- The app is plain HTML / CSS / JavaScript with no build step. Firebase is loaded from a CDN as an ES module, so `public/app.js` runs in the browser exactly as it is written.
- Comments in the source are written in Japanese and explain *why* a piece of code exists rather than what it does. Please keep that style.
- Changes to `firestore.rules` affect who can read and write every note. Explain the reasoning in your pull request.
- When you touch the sharing logic, test with two browsers open on the same note — one as the host, one as a viewer.
- Keep the layout usable on a tablet in landscape, since that is the main way the app is used.

## Questions?
Feel free to open an issue if you need help understanding the Firestore structure or the offline cache.
