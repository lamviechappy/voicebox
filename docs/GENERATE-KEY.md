  1. Generate signing key:
  cd tauri/src-tauri
  bunx @tauri-apps/cli signer generate
  
  2. Update tauri.conf.json to point to your repo:
  "plugins": {
    "updater": {
      "pubkey": "YOUR_GENERATED_PUBLIC_KEY",
      "endpoints": ["https://github.com/lamviechappy/voicebox/releases/latest/download/latest.json"]
    } 
  } 
  
  3. Set the private key as a GitHub secret for CI/CD to sign releases.

  4. Your CI/CD workflow needs to publish to your repo when you push a tag.





## Step 1
donald@MacMiniM4 src-tauri % bunx @tauri-apps/cli signer generate
Please enter a password to protect the secret key.
Password: 81xx68
Password (one more time): 81xx68
Deriving a key from the password in order to encrypt the secret key... done

Your keys were generated successfully!

Private: (Keep it secret!)
dW50cnVzdGVkIGNvbW1lbnQ6IHJzaWduIGVuY3J5cHRlZCBzZWNyZXQga2V5ClJXUlRZMEl5QXZ1cHcyd2IySjJlVWMwVEhkeXB3QlE2bWVWWDB4OTBxRWR3ckdFTnA4Z0FBQkFBQUFBQUFBQUFBQUlBQUFBQVVXbThvRExBODE4VTRwb09xOFVxdHVnQU1qbDZPa2ZURE1yYmVDVzIxRUwzTFlybkdmSlFLZnF0M0hEZ2xWK2prNHU1bkVFV2YzOEdwS1E3UUFhN21YanRLSTlLaStPUGh4b1BSTUtaYVdnRjl6N2M2QnJaWjV1MERORjRvMmVWNk1mVGwxZFoxUGc9Cg==

Public:
dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEEwQzU2RTUzNkYwRjEzM0IKUldRN0V3OXZVMjdGb0tiYUFueVBhd1dxQ3YyRCthTEpDTGQ0RVBCOWtSRXpTWUI1TElVOGNSRVMK

Environment variables used to sign:
- `TAURI_SIGNING_PRIVATE_KEY`: String of your private key
- `TAURI_SIGNING_PRIVATE_KEY_PATH`: Path to your private key file
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`:  Your private key password (optional if key has no password)

ATTENTION: If you lose your private key OR password, you'll not be able to sign your update package and updates will not work


# Step 2
export TAURI_SIGNING_PRIVATE_KEY="your-private-key-here"
export TAURI_SIGNING_PRIVATE_KEY='dW50cnVzdGVkIGNvbW1lbnQ6IHJzaWduIGVuY3J5cHRlZCBzZWNyZXQga2V5ClJXUlRZMEl5QXZ1cHcyd2IySjJlVWMwVEhkeXB3QlE2bWVWWDB4OTBxRWR3ckdFTnA4Z0FBQkFBQUFBQUFBQUFBQUlBQUFBQVVXbThvRExBODE4VTRwb09xOFVxdHVnQU1qbDZPa2ZURE1yYmVDVzIxRUwzTFlybkdmSlFLZnF0M0hEZ2xWK2prNHU1bkVFV2YzOEdwS1E3UUFhN21YanRLSTlLaStPUGh4b1BSTUtaYVdnRjl6N2M2QnJaWjV1MERORjRvMmVWNk1mVGwxZFoxUGc9Cg=='

# Step 3
Also, for CI/CD to work, you need to add the private key as a GitHub secret:

  1. Go to your repo: https://github.com/lamviechappy/voicebox → Settings → Secrets and variables →
  Actions
  2. Add a new secret: TAURI_SIGNING_PRIVATE_KEY
  3. Paste your private key value