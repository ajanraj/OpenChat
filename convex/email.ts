import { Resend } from "@convex-dev/resend";
import { v } from "convex/values";
import { marked } from "marked";
import { components } from "./_generated/api";
import { internalMutation } from "./_generated/server";

// Email validation regex at top level for performance
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_CONTENT_LENGTH = 5000;

// Initialize Resend with the component
export const resend: Resend = new Resend(components.resend, {
  // Enable test mode in development (set to false in production via env var)
  testMode: process.env.NODE_ENV !== "production",
});

/**
 * Convert markdown to sanitized HTML for email rendering
 * Uses marked for conversion and simple regex-based sanitization for email safety
 */
function markdownToSafeHtml(markdown: string): string {
  // Configure marked for safe HTML output
  marked.setOptions({
    breaks: true, // Convert newlines to <br>
    gfm: true, // Enable GitHub Flavored Markdown
  });

  // Convert markdown to HTML
  // marked.parse can return a string or Promise<string>, but without async extensions it returns string
  let html = marked.parse(markdown) as string;

  // Basic sanitization for email safety
  // Remove any script tags and their content
  html = html.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    ""
  );

  // Remove any on* event attributes
  html = html.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, "");
  html = html.replace(/\son\w+\s*=\s*[^\s>]*/gi, "");

  // Remove javascript: protocol from links
  html = html.replace(/href\s*=\s*["']?\s*javascript:[^"'>]*/gi, 'href="#"');

  // Remove data: URLs from images (except safe image formats)
  html = html.replace(
    /src\s*=\s*["']?\s*data:(?!image\/(png|jpg|jpeg|gif|webp|svg\+xml))[^"'>]*/gi,
    'src=""'
  );

  // Remove any style tags and their content (optional, but recommended for email)
  html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");

  // Remove any meta tags
  html = html.replace(/<meta\b[^>]*>/gi, "");

  // Remove any iframe tags
  html = html.replace(
    /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
    ""
  );

  // Remove any object/embed tags
  html = html.replace(
    /<(object|embed)\b[^<]*(?:(?!<\/(object|embed)>)<[^<]*)*<\/(object|embed)>/gi,
    ""
  );

  return html;
}

/**
 * Send a task summary email to the user
 * This function is designed to never throw errors that would break task execution
 */
export const sendTaskSummaryEmail = internalMutation({
  args: {
    userId: v.id("users"),
    taskId: v.id("scheduled_tasks"),
    taskTitle: v.string(),
    taskContent: v.string(),
    executionDate: v.string(),
    chatId: v.id("chats"),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    try {
      // Get user details to check for email address
      const user = await ctx.db.get(args.userId);

      if (!user) {
        return { success: false, error: "User not found" };
      }

      if (!user.email) {
        return { success: false, error: "User has no email address" };
      }

      // Validate email format (basic validation)
      if (!EMAIL_REGEX.test(user.email)) {
        return { success: false, error: "Invalid email format" };
      }

      // Truncate content if too long for email
      let emailContent = args.taskContent;
      let contentTruncated = false;

      if (emailContent.length > MAX_CONTENT_LENGTH) {
        emailContent = `${emailContent.substring(0, MAX_CONTENT_LENGTH)}...`;
        contentTruncated = true;
      }

      // Convert markdown to HTML for the HTML email template
      const htmlTaskContent = markdownToSafeHtml(emailContent);

      // Create email HTML template
      const htmlContent = createEmailTemplate({
        taskTitle: args.taskTitle,
        executionDate: args.executionDate,
        taskContent: htmlTaskContent, // Use converted HTML
        contentTruncated,
        chatId: args.chatId,
        userName: user.name || user.preferredName || "there",
      });

      // Create plain text version (keep original markdown for text-only emails)
      const textContent = createTextTemplate({
        taskTitle: args.taskTitle,
        executionDate: args.executionDate,
        taskContent: emailContent, // Keep markdown for plain text
        contentTruncated,
        chatId: args.chatId,
        userName: user.name || user.preferredName || "there",
      });

      // Send email using Resend
      await resend.sendEmail(ctx, {
        from: "OS Chat <noreply@oschat.ai>",
        to: user.email,
        subject: `Task Complete: ${args.taskTitle}`,
        html: htmlContent,
        text: textContent,
      });

      return { success: true };
    } catch (error) {
      // Log error but don't throw - we never want to break task execution
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Create HTML email template for task summary
 * Currently using the monospace terminal-style template
 */
function createEmailTemplate({
  taskTitle,
  executionDate,
  taskContent,
  contentTruncated,
  chatId,
  userName,
}: {
  taskTitle: string;
  executionDate: string;
  taskContent: string;
  contentTruncated: boolean;
  chatId: string;
  userName: string;
}): string {
  // Use the monospace terminal template (template #8)
  return createMonospaceTemplate({
    taskTitle,
    executionDate,
    taskContent,
    contentTruncated,
    chatId,
    userName,
  });
}

/**
 * Monospace terminal-style email template (Active Template)
 */
function createMonospaceTemplate({
  taskTitle,
  executionDate,
  taskContent,
  contentTruncated,
  chatId,
  userName,
}: {
  taskTitle: string;
  executionDate: string;
  taskContent: string;
  contentTruncated: boolean;
  chatId: string;
  userName: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>Task Complete: ${escapeHtml(taskTitle)}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', 'Courier New', monospace;
            line-height: 1.6;
            color: #333333;
            background: #f8f8f8;
            min-height: 100vh;
            padding: 20px;
            font-size: 14px;
        }
        
        .email-container {
            max-width: 650px;
            margin: 0 auto;
            background: #ffffff;
            border: 1px solid #cccccc;
            font-family: inherit;
            animation: typeIn 0.8s ease-out;
        }
        
        @keyframes typeIn {
            from {
                opacity: 0;
                transform: translateX(-20px);
            }
            to {
                opacity: 1;
                transform: translateX(0);
            }
        }
        
        .terminal-header {
            background: #2d2d2d;
            color: #ffffff;
            padding: 12px 20px;
            font-size: 12px;
            border-bottom: 1px solid #cccccc;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        
        .terminal-controls {
            display: flex;
            gap: 6px;
        }
        
        .control-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #666666;
        }
        
        .control-dot.red { background: #ff5f56; }
        .control-dot.yellow { background: #ffbd2e; }
        .control-dot.green { background: #27ca3f; }
        
        .terminal-title {
            font-weight: 400;
            flex: 1;
            text-align: center;
            margin: 0 20px;
        }
        
        .content {
            padding: 30px;
            background: #ffffff;
        }
        
        .prompt-line {
            display: flex;
            align-items: flex-start;
            margin-bottom: 15px;
            font-size: 14px;
        }
        
        .prompt {
            color: #666666;
            margin-right: 10px;
            flex-shrink: 0;
            user-select: none;
        }
        
        .command {
            color: #333333;
            flex: 1;
        }
        
        .output {
            margin-left: 20px;
            margin-bottom: 20px;
            padding-left: 10px;
            border-left: 2px solid #eeeeee;
        }
        
        .section-header {
            color: #666666;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin: 30px 0 15px 0;
            padding-bottom: 5px;
            border-bottom: 1px solid #eeeeee;
        }
        
        .info-block {
            background: #fafafa;
            border: 1px solid #eeeeee;
            padding: 20px;
            margin: 15px 0;
            position: relative;
        }
        
        .info-block::before {
            content: '';
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            width: 3px;
            background: #333333;
        }
        
        .key-value {
            display: flex;
            margin-bottom: 8px;
            align-items: baseline;
        }
        
        .key {
            color: #666666;
            min-width: 120px;
            margin-right: 20px;
            font-size: 12px;
        }
        
        .value {
            color: #333333;
            font-weight: 500;
        }
        
        .code-block {
            background: #f5f5f5;
            border: 1px solid #dddddd;
            padding: 20px;
            margin: 15px 0;
            font-size: 13px;
            line-height: 1.5;
            color: #444444;
            overflow-x: auto;
        }
        
        /* Styles for markdown-rendered content */
        .code-block h1, .code-block h2, .code-block h3, 
        .code-block h4, .code-block h5, .code-block h6 {
            margin: 16px 0 8px 0;
            font-weight: 600;
            line-height: 1.3;
            color: #333333;
        }
        
        .code-block h1 { font-size: 20px; }
        .code-block h2 { font-size: 18px; }
        .code-block h3 { font-size: 16px; }
        .code-block h4 { font-size: 14px; }
        .code-block h5 { font-size: 13px; }
        .code-block h6 { font-size: 12px; }
        
        .code-block p {
            margin: 8px 0;
            white-space: normal;
        }
        
        .code-block ul, .code-block ol {
            margin: 8px 0;
            padding-left: 24px;
        }
        
        .code-block li {
            margin: 4px 0;
            white-space: normal;
        }
        
        .code-block code {
            background: #e8e8e8;
            padding: 2px 4px;
            border-radius: 2px;
            font-family: inherit;
            font-size: 12px;
        }
        
        .code-block pre {
            background: #333333;
            color: #f8f8f8;
            padding: 12px;
            margin: 8px 0;
            border-radius: 2px;
            overflow-x: auto;
            white-space: pre;
        }
        
        .code-block pre code {
            background: transparent;
            padding: 0;
            color: inherit;
        }
        
        .code-block a {
            color: #0066cc;
            text-decoration: underline;
        }
        
        .code-block a:hover {
            color: #0052a3;
        }
        
        .code-block blockquote {
            border-left: 3px solid #999999;
            padding-left: 12px;
            margin: 8px 0;
            color: #666666;
        }
        
        .code-block strong {
            font-weight: 600;
            color: #333333;
        }
        
        .code-block em {
            font-style: italic;
        }
        
        .code-block hr {
            border: none;
            border-top: 1px solid #cccccc;
            margin: 16px 0;
        }
        
        .code-block table {
            border-collapse: collapse;
            margin: 12px 0;
        }
        
        .code-block th, .code-block td {
            border: 1px solid #dddddd;
            padding: 8px 12px;
            text-align: left;
        }
        
        .code-block th {
            background: #e8e8e8;
            font-weight: 600;
        }
        
        .status-line {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 20px;
        }
        
        .status-indicator {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #27ca3f;
        }
        
        .status-text {
            color: #333333;
            font-weight: 500;
        }
        
        .warning-block {
            background: #fffbf0;
            border: 1px solid #f0e68c;
            padding: 15px;
            margin: 15px 0;
            position: relative;
        }
        
        .warning-block::before {
            content: '⚠';
            position: absolute;
            left: 15px;
            top: 15px;
            color: #b8860b;
        }
        
        .warning-content {
            margin-left: 25px;
            color: #8b4513;
            font-size: 12px;
        }
        
        .action-section {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eeeeee;
        }
        
        .button-container {
            margin: 20px 0;
        }
        
        .cli-button {
            display: inline-block;
            background: #333333;
            color: #ffffff;
            text-decoration: none;
            padding: 12px 24px;
            border: 1px solid #333333;
            font-family: inherit;
            font-size: 13px;
            font-weight: 400;
            transition: all 0.2s ease;
            cursor: pointer;
        }
        
        .cli-button:hover {
            background: #ffffff;
            color: #333333;
            border-color: #333333;
        }
        
        .cli-button::before {
            content: '$ ';
            opacity: 0.7;
        }
        
        .footer {
            background: #f5f5f5;
            border-top: 1px solid #eeeeee;
            padding: 20px 30px;
            font-size: 12px;
            color: #666666;
        }
        
        .footer-line {
            margin-bottom: 8px;
        }
        
        .footer-link {
            color: #333333;
            text-decoration: underline;
        }
        
        .footer-link:hover {
            text-decoration: none;
        }
        
        .comment {
            color: #999999;
            font-style: italic;
        }
        
        @media (max-width: 640px) {
            body {
                padding: 10px;
                font-size: 13px;
            }
            
            .content, .footer {
                padding: 20px 15px;
            }
            
            .key {
                min-width: 80px;
                margin-right: 10px;
            }
            
            .code-block {
                padding: 15px;
                font-size: 12px;
            }
            
            .cli-button {
                padding: 10px 20px;
                font-size: 12px;
            }
        }
        
        @media (prefers-color-scheme: dark) {
            body {
                background: #1a1a1a;
                color: #e0e0e0;
            }
            
            .email-container {
                background: #2d2d2d;
                border-color: #444444;
            }
            
            .terminal-header {
                background: #1a1a1a;
                border-color: #444444;
            }
            
            .content {
                background: #2d2d2d;
            }
            
            .command, .value, .status-text {
                color: #e0e0e0;
            }
            
            .prompt, .key, .comment {
                color: #999999;
            }
            
            .section-header {
                color: #cccccc;
                border-color: #444444;
            }
            
            .output {
                border-color: #444444;
            }
            
            .info-block {
                background: #3a3a3a;
                border-color: #444444;
            }
            
            .info-block::before {
                background: #e0e0e0;
            }
            
            .code-block {
                background: #3a3a3a;
                border-color: #444444;
                color: #cccccc;
            }
            
            .code-block h1, .code-block h2, .code-block h3,
            .code-block h4, .code-block h5, .code-block h6 {
                color: #e0e0e0;
            }
            
            .code-block code {
                background: #2d2d2d;
                color: #e0e0e0;
            }
            
            .code-block pre {
                background: #1a1a1a;
                color: #e0e0e0;
            }
            
            .code-block a {
                color: #6db3f2;
            }
            
            .code-block a:hover {
                color: #8bc4f7;
            }
            
            .code-block blockquote {
                border-color: #666666;
                color: #999999;
            }
            
            .code-block strong {
                color: #e0e0e0;
            }
            
            .code-block hr {
                border-color: #555555;
            }
            
            .code-block th {
                background: #2d2d2d;
            }
            
            .code-block th, .code-block td {
                border-color: #555555;
            }
            
            .warning-block {
                background: #3a2f1a;
                border-color: #665a2d;
            }
            
            .warning-content {
                color: #d4a574;
            }
            
            .warning-block::before {
                color: #d4a574;
            }
            
            .action-section {
                border-color: #444444;
            }
            
            .cli-button {
                background: #e0e0e0;
                color: #1a1a1a;
                border-color: #e0e0e0;
            }
            
            .cli-button:hover {
                background: #2d2d2d;
                color: #e0e0e0;
            }
            
            .footer {
                background: #3a3a3a;
                border-color: #444444;
            }
            
            .footer-link {
                color: #e0e0e0;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="terminal-header">
            <div class="terminal-controls">
                <div class="control-dot red"></div>
                <div class="control-dot yellow"></div>
                <div class="control-dot green"></div>
            </div>
            <div class="terminal-title">task-notification.log</div>
            <div style="width: 60px;"></div>
        </div>
        
        <div class="content">
            <div class="prompt-line">
                <span class="prompt">$</span>
                <span class="command">cat task_completion.log</span>
            </div>
            
            <div class="output">
                <div class="status-line">
                    <div class="status-indicator"></div>
                    <span class="status-text">TASK_COMPLETE</span>
                </div>
                
                <div class="section-header">// Message</div>
                <div class="prompt-line">
                    <span class="prompt">></span>
                    <span class="command">Hello ${escapeHtml(userName)},</span>
                </div>
                <div class="prompt-line">
                    <span class="prompt">></span>
                    <span class="command">Your scheduled task has been completed successfully.</span>
                </div>
                
                <div class="section-header">// Task Information</div>
                <div class="info-block">
                    <div class="key-value">
                        <span class="key">task_name:</span>
                        <span class="value">"${escapeHtml(taskTitle)}"</span>
                    </div>
                    <div class="key-value">
                        <span class="key">status:</span>
                        <span class="value">completed</span>
                    </div>
                    <div class="key-value">
                        <span class="key">completed_at:</span>
                        <span class="value">${escapeHtml(executionDate)}</span>
                    </div>
                </div>
                
                <div class="section-header">// Execution Output</div>
                <div class="code-block">${taskContent}</div>
                
                ${
                  contentTruncated
                    ? `<div class="warning-block">
                    <div class="warning-content">
                        <strong>INFO:</strong> Output truncated. Full results available in dashboard.
                    </div>
                </div>`
                    : ""
                }
                
                <div class="section-header">// Next Actions</div>
                <div class="prompt-line">
                    <span class="prompt">></span>
                    <span class="command">View complete results and logs</span>
                </div>
                
                <div class="button-container">
                    <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://oschat.ai"}/c/${chatId}" class="cli-button">
                        open dashboard
                    </a>
                </div>
                
                <div class="action-section">
                    <div class="prompt-line">
                        <span class="prompt">#</span>
                        <span class="command comment">End of log file</span>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="footer">
            <div class="footer-line">
                <span class="comment">// This notification was sent because email alerts are enabled for this task</span>
            </div>
            <div class="footer-line">
                <span class="comment">// Configure settings: </span>
                <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://oschat.ai"}/settings" class="footer-link">account_settings</a>
            </div>
        </div>
    </div>
</body>
</html>`;
}

/**
 * Swiss minimal email template (Alternative Template)
 */
// function createSwissTemplate({
//   taskTitle,
//   executionDate,
//   taskContent,
//   contentTruncated,
//   chatId,
//   userName,
// }: {
//   taskTitle: string;
//   executionDate: string;
//   taskContent: string;
//   contentTruncated: boolean;
//   chatId: string;
//   userName: string;
// }): string {
//   return `<!DOCTYPE html>
// <html lang="en">
// <head>
//     <meta charset="UTF-8">
//     <meta name="viewport" content="width=device-width, initial-scale=1.0">
//     <meta name="color-scheme" content="light dark">
//     <meta name="supported-color-schemes" content="light dark">
//     <title>Task Complete: ${escapeHtml(taskTitle)}</title>
//     <style>
//         * {
//             margin: 0;
//             padding: 0;
//             box-sizing: border-box;
//         }

//         body {
//             font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
//             line-height: 1.5;
//             color: #2c2c2c;
//             background: #ffffff;
//             min-height: 100vh;
//             padding: 40px 20px;
//         }

//         .email-container {
//             max-width: 600px;
//             margin: 0 auto;
//             background: #ffffff;
//             border: 1px solid #e5e5e5;
//             animation: fadeIn 0.6s ease-out;
//         }

//         @keyframes fadeIn {
//             from {
//                 opacity: 0;
//                 transform: translateY(20px);
//             }
//             to {
//                 opacity: 1;
//                 transform: translateY(0);
//             }
//         }

//         .header {
//             padding: 60px 40px 40px;
//             border-bottom: 1px solid #e5e5e5;
//         }

//         .status-indicator {
//             width: 12px;
//             height: 12px;
//             background: #2c2c2c;
//             border-radius: 50%;
//             margin-bottom: 30px;
//         }

//         .header-title {
//             font-size: 32px;
//             font-weight: 300;
//             color: #2c2c2c;
//             margin-bottom: 12px;
//             letter-spacing: -0.5px;
//         }

//         .header-subtitle {
//             font-size: 16px;
//             color: #666666;
//             font-weight: 400;
//             line-height: 1.4;
//         }

//         .main-content {
//             padding: 40px;
//         }

//         .section {
//             margin-bottom: 50px;
//         }

//         .section:last-child {
//             margin-bottom: 0;
//         }

//         .section-label {
//             font-size: 12px;
//             color: #999999;
//             text-transform: uppercase;
//             letter-spacing: 1px;
//             margin-bottom: 16px;
//             font-weight: 500;
//         }

//         .greeting {
//             font-size: 18px;
//             color: #2c2c2c;
//             margin-bottom: 20px;
//             font-weight: 400;
//         }

//         .body-text {
//             font-size: 16px;
//             color: #666666;
//             line-height: 1.6;
//             margin-bottom: 0;
//         }

//         .task-info {
//             border-left: 2px solid #2c2c2c;
//             padding-left: 20px;
//         }

//         .task-title {
//             font-size: 20px;
//             font-weight: 500;
//             color: #2c2c2c;
//             margin-bottom: 8px;
//             line-height: 1.3;
//         }

//         .task-meta {
//             font-size: 14px;
//             color: #999999;
//             font-weight: 400;
//         }

//         .results-content {
//             background: #fafafa;
//             padding: 30px;
//             font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace;
//             font-size: 14px;
//             line-height: 1.6;
//             color: #444444;
//             white-space: pre-wrap;
//             border: 1px solid #e5e5e5;
//         }

//         .notice {
//             margin-top: 20px;
//             padding: 20px;
//             background: #f5f5f5;
//             border: 1px solid #e0e0e0;
//             font-size: 14px;
//             color: #666666;
//             line-height: 1.5;
//         }

//         .notice-title {
//             font-weight: 500;
//             color: #2c2c2c;
//             margin-bottom: 4px;
//         }

//         .cta-section {
//             margin-top: 50px;
//             padding-top: 30px;
//             border-top: 1px solid #e5e5e5;
//         }

//         .cta-button {
//             display: inline-block;
//             background: #2c2c2c;
//             color: #ffffff;
//             text-decoration: none;
//             padding: 16px 32px;
//             font-size: 14px;
//             font-weight: 500;
//             text-transform: uppercase;
//             letter-spacing: 0.5px;
//             transition: all 0.2s ease;
//         }

//         .cta-button:hover {
//             background: #1a1a1a;
//             transform: translateY(-1px);
//         }

//         .footer {
//             padding: 40px;
//             border-top: 1px solid #e5e5e5;
//             background: #fafafa;
//         }

//         .footer-text {
//             font-size: 14px;
//             color: #999999;
//             line-height: 1.6;
//             margin-bottom: 8px;
//             text-align: center;
//         }

//         .footer-link {
//             color: #2c2c2c;
//             text-decoration: none;
//             font-weight: 500;
//         }

//         .footer-link:hover {
//             text-decoration: underline;
//         }

//         .divider {
//             height: 1px;
//             background: #e5e5e5;
//             margin: 30px 0;
//         }

//         @media (max-width: 640px) {
//             body {
//                 padding: 20px 10px;
//             }

//             .header {
//                 padding: 40px 25px 30px;
//             }

//             .main-content {
//                 padding: 30px 25px;
//             }

//             .footer {
//                 padding: 30px 25px;
//             }

//             .header-title {
//                 font-size: 28px;
//             }

//             .task-info {
//                 padding-left: 15px;
//             }

//             .results-content {
//                 padding: 20px;
//             }

//             .cta-button {
//                 padding: 14px 28px;
//                 font-size: 13px;
//             }
//         }

//         @media (prefers-color-scheme: dark) {
//             body {
//                 background: #1a1a1a;
//                 color: #e5e5e5;
//             }

//             .email-container {
//                 background: #1a1a1a;
//                 border-color: #333333;
//             }

//             .header {
//                 border-color: #333333;
//             }

//             .status-indicator {
//                 background: #e5e5e5;
//             }

//             .header-title {
//                 color: #e5e5e5;
//             }

//             .header-subtitle {
//                 color: #999999;
//             }

//             .greeting, .task-title {
//                 color: #e5e5e5;
//             }

//             .body-text {
//                 color: #999999;
//             }

//             .task-info {
//                 border-color: #e5e5e5;
//             }

//             .results-content {
//                 background: #2a2a2a;
//                 border-color: #333333;
//                 color: #cccccc;
//             }

//             .notice {
//                 background: #2a2a2a;
//                 border-color: #333333;
//             }

//             .notice-title {
//                 color: #e5e5e5;
//             }

//             .cta-section {
//                 border-color: #333333;
//             }

//             .cta-button {
//                 background: #e5e5e5;
//                 color: #1a1a1a;
//             }

//             .cta-button:hover {
//                 background: #ffffff;
//             }

//             .footer {
//                 background: #2a2a2a;
//                 border-color: #333333;
//             }

//             .footer-link {
//                 color: #e5e5e5;
//             }

//             .divider {
//                 background: #333333;
//             }
//         }
//     </style>
// </head>
// <body>
//     <div class="email-container">
//         <div class="header">
//             <div class="status-indicator"></div>
//             <h1 class="header-title">Task Complete</h1>
//             <p class="header-subtitle">Your scheduled automation has finished successfully</p>
//         </div>

//         <div class="main-content">
//             <div class="section">
//                 <p class="section-label">Message</p>
//                 <p class="greeting">Hello ${escapeHtml(userName)},</p>
//                 <p class="body-text">Your scheduled task has been completed successfully. Here's a summary of the results.</p>
//             </div>

//             <div class="divider"></div>

//             <div class="section">
//                 <p class="section-label">Task Details</p>
//                 <div class="task-info">
//                     <h2 class="task-title">${escapeHtml(taskTitle)}</h2>
//                     <p class="task-meta">Completed on ${escapeHtml(executionDate)}</p>
//                 </div>
//             </div>

//             <div class="divider"></div>

//             <div class="section">
//                 <p class="section-label">Results</p>
//                 <div class="results-content">${escapeHtml(taskContent)}</div>
//                 ${
//                   contentTruncated
//                     ? `<div class="notice">
//                     <div class="notice-title">Content Truncated</div>
//                     <div>The full results are available in the application. Use the button below to view the complete response.</div>
//                 </div>`
//                     : ''
//                 }
//             </div>

//             <div class="cta-section">
//                 <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://oschat.ai'}/chat/${chatId}" class="cta-button">
//                     View Full Results
//                 </a>
//             </div>
//         </div>

//         <div class="footer">
//             <p class="footer-text">This email was sent because you enabled email notifications for this scheduled task.</p>
//             <p class="footer-text">You can manage your notification preferences in your <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://oschat.ai'}/settings" class="footer-link">account settings</a>.</p>
//         </div>
//     </div>
// </body>
// </html>`;
// }

/**
 * Create plain text email template for task summary
 */
function createTextTemplate({
  taskTitle,
  executionDate,
  taskContent,
  contentTruncated,
  chatId,
  userName,
}: {
  taskTitle: string;
  executionDate: string;
  taskContent: string;
  contentTruncated: boolean;
  chatId: string;
  userName: string;
}): string {
  return `Scheduled Task Complete

Hi ${userName},

Your scheduled task has been completed successfully.

Task: ${taskTitle}
Completed: ${executionDate}

Results:
${taskContent}${contentTruncated ? "\n\n[Content truncated - view full results in the app]" : ""}

View full results: ${process.env.NEXT_PUBLIC_APP_URL || "https://oschat.ai"}/chat/${chatId}

This email was sent because you enabled email notifications for this scheduled task.
You can manage your notification preferences in your account settings.
`;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
