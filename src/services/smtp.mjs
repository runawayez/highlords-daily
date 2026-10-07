export function smtpOptions(env = process.env) {
  const port = Number(env.SMTP_PORT || 587);
  if (!env.SMTP_HOST || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Configure a valid SMTP_HOST and SMTP_PORT.");
  const secure = env.SMTP_SECURE ? env.SMTP_SECURE === "true" : port === 465;
  return {
    host: env.SMTP_HOST,
    port,
    secure,
    requireTLS: !secure,
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASS || "" }
      : undefined,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    disableFileAccess: true,
    disableUrlAccess: true,
  };
}
export async function sendSmtp(message, key, env = process.env) {
  const { default: nodemailer } = await import("nodemailer").catch(() => {
    throw new Error(
      "SMTP transport missing; run npm ci with optional dependencies enabled.",
    );
  });
  const transport = nodemailer.createTransport(smtpOptions(env));
  try {
    const result = await transport.sendMail({
      ...message,
      messageId: `<${key}@highlords.local>`,
    });
    if (result.rejected?.length) {
      const error = new Error("SMTP rejected recipients.");
      error.partialDelivery = Boolean(result.accepted?.length);
      throw error;
    }
    return result;
  } finally {
    transport.close();
  }
}
