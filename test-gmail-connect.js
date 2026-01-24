import {
    checkGmailConnection,
    getGmailConnectLink
} from "./src/mastra/config/composio-config";

async function connectGmail() {
  const userId = "my-test-user"; // Your chosen user ID

  // Check if already connected
  const hasConnection = await checkGmailConnection(userId);
  if (hasConnection) {
    console.log("Gmail already connected!");
    return;
  }

  // Get OAuth link
  const authUrl = await getGmailConnectLink(userId, "gmail");
  console.log("Open this URL to connect Gmail:", authUrl);
}

connectGmail();
