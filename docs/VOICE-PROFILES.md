# Sample voice files are stored in:
  ~/Library/Application Support/sh.voicebox.app/profiles/{profile-id}/sample.wav

# To see all samples for a profile:
  ls -la "~/Library/Application Support/sh.voicebox.app/profiles/"

# To delete a specific sample:                                                               

rm "~/Library/Application Support/sh.voicebox.app/profiles/{profile-id}/sample.wav"

# To fix the crash, try:
  1. Delete the app and reinstall
  2. Or reset the app data:
  rm -rf ~/Library/Application\ Support/sh.voicebox.app
  
  Then reinstall from the DMG.