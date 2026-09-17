import * as postmark from 'postmark';
import { config } from '../../config';
import { createError } from './http-error.util';

const client = config.postmark.enabled && config.postmark.apiToken
  ? new postmark.ServerClient(config.postmark.apiToken)
  : null;

interface SendEmailOptions {
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  required?: boolean;
}

async function sendEmail(opts: SendEmailOptions): Promise<void> {
  if (!client || !config.postmark.fromEmail) {
    if (opts.required) {
      throw createError.serviceUnavailable(
        'Email delivery is temporarily unavailable. Please try again later.',
        'EMAIL_DELIVERY_UNAVAILABLE',
      );
    }
    return;
  }

  try {
    await client.sendEmail({
      From: `${config.postmark.fromName} <${config.postmark.fromEmail}>`,
      To: opts.to,
      Subject: opts.subject,
      HtmlBody: opts.htmlBody,
      TextBody: opts.textBody || opts.subject,
      MessageStream: 'outbound',
    });
  } catch {
    console.error('[EmailService] Email delivery failed');
    if (opts.required) {
      throw createError.serviceUnavailable(
        'Email delivery is temporarily unavailable. Please try again later.',
        'EMAIL_DELIVERY_UNAVAILABLE',
      );
    }
  }
}

export function ensureEmailDeliveryEnabled(): void {
  if (!client || !config.postmark.fromEmail) {
    throw createError.serviceUnavailable(
      'Email delivery is temporarily unavailable. Please try again later.',
      'EMAIL_DELIVERY_UNAVAILABLE',
    );
  }
}

// ─── Templates ─────────────────────────────────────────────────────────────────

export async function sendEmailVerification(
  to: string,
  firstName: string,
  otp: string,
): Promise<void> {
  await sendEmail({
    to,
    subject: 'Verify Your Email - Traders of Africa',
    required: true,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>Welcome to <strong>Traders of Africa</strong>!</p>
        <p>To complete your account registration, please verify your email using the One-Time Password (OTP) below.</p>
        <p>Your OTP Code:</p>
        <p style="font-size:28px;font-weight:bold;letter-spacing:4px;text-align:center;margin:28px 0;">
          ${otp}
        </p>
        <p>This code will expire in <strong>10 minutes</strong>.</p>
        <p>If you did not create an account, please ignore this email.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, your Traders of Africa OTP code is ${otp}. It expires in 10 minutes.`,
  });
}

export async function sendPasswordReset(
  to: string,
  firstName: string,
  otp: string,
): Promise<void> {
  await sendEmail({
    to,
    subject: 'Password Reset Request',
    required: true,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>We received a request to reset your password.</p>
        <p>Your password reset code is:</p>
        <p style="font-size:28px;font-weight:bold;letter-spacing:4px;text-align:center;margin:28px 0;">
          ${otp}
        </p>
        <p>This code expires in <strong>10 minutes</strong>.</p>
        <p>If you did not request this, please ignore this email.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, your password reset code is ${otp}. It expires in 10 minutes.`,
  });
}

export async function sendAdminAccessGrantedEmail(to: string): Promise<void> {
  await sendEmail({
    to,
    subject: 'Admin Access Granted',
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <p>Hello,</p>
        <p>You have been granted administrative access to the Traders of Africa platform.</p>
        <p>You can now log in to the admin dashboard using the credentials provided.</p>
        <p>Please ensure your credentials remain secure.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa</strong></p>
      </div>
    `,
    textBody: 'Hello, you have been granted administrative access to the Traders of Africa platform.',
  });
}

export async function sendAdminInvitationEmail(
  to: string,
  firstName: string,
  roleName: string | null,
  setupLink: string,
): Promise<void> {
  await sendEmail({
    to,
    subject: "You've Been Invited to TOFA Marketplace Admin",
    required: true,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>You have been granted administrative access to the Traders of Africa Marketplace.</p>
        ${roleName ? `<p><strong>Role:</strong> ${roleName}</p>` : ''}
        <p>Please use the link below to complete your Admin account setup and create your password.</p>
        <p><a href="${setupLink}">${setupLink}</a></p>
        <p>For security purposes, this link will expire in <strong>24 hours</strong> and can only be used once.</p>
        <p>If you were not expecting this invitation, please contact the TOFA team.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, you have been invited to TOFA Marketplace Admin.${roleName ? ` Role: ${roleName}.` : ''} Complete setup here: ${setupLink}. This link expires in 24 hours.`,
  });
}

export async function sendAdminDeactivationEmail(
  to: string,
  firstName: string,
): Promise<void> {
  await sendEmail({
    to,
    subject: 'Your TOFA Marketplace Admin Access Has Been Deactivated',
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>Your administrative access to the Traders of Africa Marketplace has been deactivated.</p>
        <p>You will no longer be able to access the Admin platform.</p>
        <p>If you believe this action was taken in error or require clarification, please contact the appropriate TOFA administrator.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, your TOFA Marketplace Admin access has been deactivated.`,
  });
}

export async function sendAdminReactivationEmail(
  to: string,
  firstName: string,
): Promise<void> {
  await sendEmail({
    to,
    subject: 'Your TOFA Marketplace Admin Access Has Been Restored',
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>Your administrative access to the Traders of Africa Marketplace has been restored.</p>
        <p>You can now sign in and access the Admin features permitted for your account.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, your TOFA Marketplace Admin access has been restored.`,
  });
}

export async function sendAdminPasswordChangedEmail(
  to: string,
  firstName: string,
): Promise<void> {
  await sendEmail({
    to,
    subject: 'Your TOFA Admin Password Has Been Changed',
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>The password for your TOFA Marketplace Admin account has been changed successfully.</p>
        <p>If you made this change, no further action is required.</p>
        <p>If you did not make this change, please contact the appropriate TOFA administrator immediately.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, your TOFA Marketplace Admin password has been changed.`,
  });
}

export async function sendAdminPasswordResetEmail(
  to: string,
  firstName: string,
  otp: string,
): Promise<void> {
  await sendEmail({
    to,
    subject: 'TOFA Admin Password Reset',
    required: true,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>We received a request to reset the password for your TOFA Marketplace Admin account.</p>
        <p>Your password reset code is:</p>
        <p style="font-size:28px;font-weight:bold;letter-spacing:4px;text-align:center;margin:28px 0;">
          ${otp}
        </p>
        <p>This code will expire in <strong>10 minutes</strong>.</p>
        <p>If you did not request this password reset, please ignore this email and contact the appropriate TOFA administrator if you notice any suspicious activity.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, your TOFA Admin password reset code is ${otp}. It expires in 10 minutes.`,
  });
}

export async function sendAccountRestrictionEmail(
  to: string,
  firstName: string,
  reason?: string,
): Promise<void> {
  await sendEmail({
    to,
    subject: 'Account Restriction Notice',
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>Your Traders of Africa account has been restricted.</p>
        ${reason ? `<p>Reason: ${reason}</p>` : ''}
        <p>Please contact support if you believe this was done in error.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, your Traders of Africa account has been restricted.${reason ? ` Reason: ${reason}` : ''}`,
  });
}

export async function sendPaymentInstructionsEmail(
  to: string,
  firstName: string,
  payment: {
    paymentReference: string;
    description: string;
    amount: number;
    currency: string;
    expiresAt: Date | null;
  },
  account: {
    bankName: string;
    accountName: string;
    accountNumber: string;
  },
): Promise<void> {
  await sendEmail({
    to,
    subject: `Complete your TOFA payment - ${payment.paymentReference}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>A payment has been created for: <strong>${payment.description}</strong></p>
        <p><strong>Payment Reference:</strong> ${payment.paymentReference}</p>
        <p><strong>Amount:</strong> ${payment.currency} ${payment.amount}</p>
        <p><strong>Bank Name:</strong> ${account.bankName}</p>
        <p><strong>Account Name:</strong> ${account.accountName}</p>
        <p><strong>Account Number:</strong> ${account.accountNumber}</p>
        <p>Where possible, include the payment reference in your transfer narration.</p>
        ${
          payment.expiresAt
            ? `<p><strong>Payment Deadline:</strong> ${payment.expiresAt.toISOString()}</p>`
            : ''
        }
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, complete payment ${payment.paymentReference} for ${payment.currency} ${payment.amount}. Bank: ${account.bankName}, ${account.accountName}, ${account.accountNumber}.`,
  });
}

export async function sendPaymentProofReceivedEmail(
  to: string,
  firstName: string,
  payment: {
    paymentReference: string;
    description: string;
    purpose: string;
    paymentMethod: string;
    amount: number;
    currency: string;
    transactionReference: string | null;
    submittedAt: Date;
  },
): Promise<void> {
  await sendEmail({
    to,
    subject: `Payment proof received - ${payment.paymentReference}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>We have received the payment proof submitted for your TOFA transaction.</p>
        <p><strong>Payment Reference:</strong> ${payment.paymentReference}</p>
        <p><strong>Payment Purpose:</strong> ${payment.purpose}</p>
        <p><strong>Payment Method:</strong> ${payment.paymentMethod}</p>
        <p><strong>Amount:</strong> ${payment.currency} ${payment.amount}</p>
        ${payment.transactionReference ? `<p><strong>Transaction Reference:</strong> ${payment.transactionReference}</p>` : ''}
        <p><strong>Submitted At:</strong> ${payment.submittedAt.toISOString()}</p>
        <p>Your payment is now awaiting verification.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, payment proof for ${payment.paymentReference} was received and is awaiting verification.`,
  });
}

export async function sendPaymentConfirmedEmail(
  to: string,
  firstName: string,
  payment: {
    paymentReference: string;
    description: string;
    paymentMethod: string;
    amount: number;
    currency: string;
    paidAt: Date;
    completionMessage: string;
  },
): Promise<void> {
  await sendEmail({
    to,
    subject: `Payment confirmed - ${payment.paymentReference}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>Your payment has been successfully confirmed.</p>
        <p><strong>Payment Reference:</strong> ${payment.paymentReference}</p>
        <p><strong>Payment For:</strong> ${payment.description}</p>
        <p><strong>Payment Method:</strong> ${payment.paymentMethod}</p>
        <p><strong>Amount Paid:</strong> ${payment.currency} ${payment.amount}</p>
        <p><strong>Payment Date:</strong> ${payment.paidAt.toISOString()}</p>
        <p>${payment.completionMessage}</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, payment ${payment.paymentReference} has been confirmed.`,
  });
}

export async function sendPaymentRejectedEmail(
  to: string,
  firstName: string,
  payment: {
    paymentReference: string;
    description: string;
    paymentMethod: string;
    amount: number;
    currency: string;
    rejectionReason: string;
    canResubmitProof: boolean;
  },
): Promise<void> {
  await sendEmail({
    to,
    subject: 'Action required: Payment verification unsuccessful',
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>We were unable to verify the payment evidence submitted for your TOFA transaction.</p>
        <p><strong>Payment Reference:</strong> ${payment.paymentReference}</p>
        <p><strong>Payment For:</strong> ${payment.description}</p>
        <p><strong>Payment Method:</strong> ${payment.paymentMethod}</p>
        <p><strong>Amount Expected:</strong> ${payment.currency} ${payment.amount}</p>
        <blockquote style="border-left:4px solid #ccc;padding:12px;margin:16px 0;color:#555;">
          ${payment.rejectionReason}
        </blockquote>
        ${
          payment.canResubmitProof
            ? '<p>Please submit a valid payment proof from your TOFA account.</p>'
            : '<p>Please contact TOFA Support and include your payment reference.</p>'
        }
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, payment ${payment.paymentReference} could not be verified. Reason: ${payment.rejectionReason}`,
  });
}

export async function sendPaymentExpiredEmail(
  to: string,
  firstName: string,
  payment: {
    paymentReference: string;
    description: string;
    amount: number;
    currency: string;
    paymentMethod: string;
  },
): Promise<void> {
  await sendEmail({
    to,
    subject: `Payment expired - ${payment.paymentReference}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>The payment window for the following TOFA transaction has expired.</p>
        <p><strong>Payment Reference:</strong> ${payment.paymentReference}</p>
        <p><strong>Payment For:</strong> ${payment.description}</p>
        <p><strong>Amount:</strong> ${payment.currency} ${payment.amount}</p>
        <p><strong>Payment Method:</strong> ${payment.paymentMethod}</p>
        <p>No confirmed payment was recorded within the allowed period.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, payment ${payment.paymentReference} has expired.`,
  });
}

type OrderEmailPayload = {
  orderReference: string;
  sellerName: string;
  buyerName: string;
  status: string;
  orderCurrency: string;
  productsSubtotal: number;
  logisticsDisplay: string;
  orderTotal: number;
  paymentCurrency: string;
  paymentAmount: number;
  deliveryMethod: string;
  deliveryAddress: string;
  items: Array<{
    productName: string | null;
    attributes: Record<string, unknown> | null;
    quantity: number;
    unit: string | null;
    unitPrice: number;
    subtotal: number;
  }>;
};

export async function sendOrderConfirmationEmail(
  to: string,
  firstName: string,
  order: OrderEmailPayload,
): Promise<void> {
  await sendEmail({
    to,
    subject: `Order confirmed with ${order.sellerName} - ${order.orderReference}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>Your Order with <strong>${order.sellerName}</strong> has been confirmed successfully.</p>
        <p><strong>Order Reference:</strong> ${order.orderReference}</p>
        ${renderOrderItems(order)}
        <h3>Order Summary</h3>
        <p><strong>Products Total:</strong> ${order.orderCurrency} ${order.productsSubtotal}</p>
        <p><strong>Logistics:</strong> ${order.logisticsDisplay}</p>
        <p><strong>Order Total:</strong> ${order.orderCurrency} ${order.orderTotal}</p>
        ${renderPaymentCurrencySection(order)}
        <p><strong>Delivery Method:</strong> ${order.deliveryMethod}</p>
        <p><strong>Delivery Address:</strong> ${order.deliveryAddress}</p>
        <p>The seller has been notified and can begin processing the Order.</p>
        ${
          order.deliveryMethod === 'Buyer-Arranged Delivery'
            ? '<p>Once the goods are ready, you will be asked to provide your logistics provider or pickup representative details.</p>'
            : ''
        }
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, your order ${order.orderReference} with ${order.sellerName} has been confirmed.`,
  });
}

export async function sendSellerOrderConfirmationEmail(
  to: string,
  firstName: string,
  order: OrderEmailPayload,
): Promise<void> {
  await sendEmail({
    to,
    subject: `New Order - ${order.orderReference}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>You have received a new TOFA Marketplace Order.</p>
        <p><strong>Order Reference:</strong> ${order.orderReference}</p>
        <p><strong>Buyer:</strong> ${order.buyerName}</p>
        ${renderOrderItems(order)}
        <p><strong>Order Total:</strong> ${order.orderCurrency} ${order.orderTotal}</p>
        <p><strong>Delivery Method:</strong> ${order.deliveryMethod}</p>
        <p>Please begin processing the Order from your seller dashboard.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, you have a new order ${order.orderReference}.`,
  });
}

export async function sendBuyerLogisticsDetailsEmail(
  to: string,
  firstName: string,
  details: {
    orderReference: string;
    buyerName: string;
    providerName: string | null;
    contactName: string | null;
    phoneNumber: string | null;
    email: string | null;
    trackingReference: string | null;
    expectedPickupDate: string | null;
    notes: string | null;
  },
): Promise<void> {
  await sendEmail({
    to,
    subject: `Buyer logistics details received - ${details.orderReference}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>The buyer has provided logistics or pickup details for this Order.</p>
        <p><strong>Order Reference:</strong> ${details.orderReference}</p>
        <p><strong>Buyer:</strong> ${details.buyerName}</p>
        <h3>Logistics / Pickup Details</h3>
        <p><strong>Provider:</strong> ${details.providerName || 'Individual representative'}</p>
        <p><strong>Contact Person:</strong> ${details.contactName || '-'}</p>
        <p><strong>Phone Number:</strong> ${details.phoneNumber || '-'}</p>
        <p><strong>Email:</strong> ${details.email || '-'}</p>
        <p><strong>Expected Pickup Date:</strong> ${details.expectedPickupDate || '-'}</p>
        <p><strong>Reference:</strong> ${details.trackingReference || '-'}</p>
        ${details.notes ? `<p><strong>Notes:</strong> ${details.notes}</p>` : ''}
        <p>Please coordinate pickup directly with the logistics provider or representative.</p>
        <p>Once the goods have been handed over, update the Order as Shipped.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, buyer logistics details were submitted for order ${details.orderReference}.`,
  });
}

export async function sendOrderStatusUpdatedEmail(
  to: string,
  firstName: string,
  order: OrderEmailPayload,
): Promise<void> {
  await sendEmail({
    to,
    subject: `Order update - ${order.orderReference}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>Your Order status has been updated.</p>
        <p><strong>Order Reference:</strong> ${order.orderReference}</p>
        <p><strong>Status:</strong> ${order.status}</p>
        <p><strong>Seller:</strong> ${order.sellerName}</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, order ${order.orderReference} is now ${order.status}.`,
  });
}

export async function sendOrderCompletedEmail(
  to: string,
  firstName: string,
  order: OrderEmailPayload,
): Promise<void> {
  await sendEmail({
    to,
    subject: `Order completed - ${order.orderReference}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>Your transaction with <strong>${order.sellerName}</strong> has been completed successfully.</p>
        <p><strong>Order Reference:</strong> ${order.orderReference}</p>
        <p><strong>Order Total:</strong> ${order.orderCurrency} ${order.orderTotal}</p>
        <p>You can now review the product(s) you purchased and your experience with the seller.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, order ${order.orderReference} has been completed.`,
  });
}

type DisputeEmailPayload = {
  disputeNumber: string;
  orderReference: string;
  reason: string;
  status?: string;
  requestMessage?: string;
  resolutionSummary?: string;
};

export async function sendDisputeSubmittedEmail(
  to: string,
  firstName: string,
  dispute: DisputeEmailPayload,
): Promise<void> {
  await sendEmail({
    to,
    subject: `Your TOFA Dispute Has Been Submitted - ${dispute.disputeNumber}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${escapeHtml(firstName || 'there')},</h2>
        <p>Your dispute regarding Order ${escapeHtml(dispute.orderReference)} has been submitted successfully.</p>
        <p><strong>Dispute Reference:</strong> ${escapeHtml(dispute.disputeNumber)}</p>
        <p><strong>Order Reference:</strong> ${escapeHtml(dispute.orderReference)}</p>
        <p><strong>Reason:</strong> ${escapeHtml(dispute.reason)}</p>
        <p><strong>Status:</strong> ${escapeHtml(dispute.status || 'Open')}</p>
        <p>TOFA will review the information provided and may contact you if additional information is required.</p>
        <p>You can follow the progress of the dispute from your TOFA Marketplace account.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, your dispute ${dispute.disputeNumber} for order ${dispute.orderReference} has been submitted.`,
  });
}

export async function sendSellerDisputeRaisedEmail(
  to: string,
  sellerName: string,
  dispute: DisputeEmailPayload,
): Promise<void> {
  await sendEmail({
    to,
    subject: `A Dispute Has Been Raised on Order ${dispute.orderReference}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${escapeHtml(sellerName || 'there')},</h2>
        <p>A Buyer has raised a dispute relating to Order ${escapeHtml(dispute.orderReference)}.</p>
        <p><strong>Dispute Reference:</strong> ${escapeHtml(dispute.disputeNumber)}</p>
        <p><strong>Reason:</strong> ${escapeHtml(dispute.reason)}</p>
        <p>Please sign in to your TOFA Marketplace account to review the dispute and provide any required response or supporting evidence.</p>
        <p>Providing accurate and timely information will help TOFA review the case.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${sellerName || 'there'}, a dispute ${dispute.disputeNumber} has been raised on order ${dispute.orderReference}.`,
  });
}

export async function sendBuyerDisputeRaisedEmail(
  to: string,
  firstName: string,
  dispute: DisputeEmailPayload,
): Promise<void> {
  await sendEmail({
    to,
    subject: `A Dispute Has Been Raised on Order ${dispute.orderReference}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${escapeHtml(firstName || 'there')},</h2>
        <p>A dispute has been raised relating to Order ${escapeHtml(dispute.orderReference)}.</p>
        <p><strong>Dispute Reference:</strong> ${escapeHtml(dispute.disputeNumber)}</p>
        <p><strong>Reason:</strong> ${escapeHtml(dispute.reason)}</p>
        <p>Please sign in to your TOFA Marketplace account to review the case and provide any requested information or supporting evidence.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, a dispute ${dispute.disputeNumber} has been raised on order ${dispute.orderReference}.`,
  });
}

export async function sendDisputeInformationRequestedEmail(
  to: string,
  firstName: string,
  dispute: DisputeEmailPayload,
): Promise<void> {
  await sendEmail({
    to,
    subject: `Additional Information Required - Dispute ${dispute.disputeNumber}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${escapeHtml(firstName || 'there')},</h2>
        <p>TOFA requires additional information to continue reviewing the dispute regarding Order ${escapeHtml(dispute.orderReference)}.</p>
        <p><strong>Dispute Reference:</strong> ${escapeHtml(dispute.disputeNumber)}</p>
        <p><strong>Information Required:</strong></p>
        <blockquote style="border-left:4px solid #ccc;padding:12px;margin:16px 0;color:#555;">
          ${escapeHtml(dispute.requestMessage || '')}
        </blockquote>
        <p>Please sign in to your TOFA Marketplace account and provide the requested information and supporting evidence.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, additional information is required for dispute ${dispute.disputeNumber}: ${dispute.requestMessage || ''}`,
  });
}

export async function sendDisputeResolvedEmail(
  to: string,
  firstName: string,
  dispute: DisputeEmailPayload,
): Promise<void> {
  await sendEmail({
    to,
    subject: `Dispute Resolved - ${dispute.disputeNumber}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${escapeHtml(firstName || 'there')},</h2>
        <p>TOFA has completed the review of the dispute regarding Order ${escapeHtml(dispute.orderReference)}.</p>
        <p><strong>Dispute Reference:</strong> ${escapeHtml(dispute.disputeNumber)}</p>
        <p><strong>Resolution:</strong></p>
        <blockquote style="border-left:4px solid #ccc;padding:12px;margin:16px 0;color:#555;">
          ${escapeHtml(dispute.resolutionSummary || 'The dispute has been resolved.')}
        </blockquote>
        <p>Where a refund or other financial adjustment is applicable, it will be processed according to the payment method and applicable payment process.</p>
        <p>You can view the complete resolution from your TOFA Marketplace account.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, dispute ${dispute.disputeNumber} for order ${dispute.orderReference} has been resolved. ${dispute.resolutionSummary || ''}`,
  });
}

export async function sendIntegratedShipmentCreatedEmail(
  to: string,
  firstName: string,
  details: {
    orderReference: string;
    providerName: string;
    serviceName: string;
    trackingId: string | null;
    trackingUrl: string | null;
    estimatedPickupAt: Date | null;
    estimatedDeliveryAt: Date | null;
  },
): Promise<void> {
  await sendEmail({
    to,
    subject: `Shipment scheduled - ${details.orderReference}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>Your Order shipment has been scheduled with ${details.providerName}.</p>
        <p><strong>Order Reference:</strong> ${details.orderReference}</p>
        <p><strong>Service:</strong> ${details.serviceName}</p>
        <p><strong>Tracking ID:</strong> ${details.trackingId || '-'}</p>
        ${details.trackingUrl ? `<p><a href="${details.trackingUrl}">Track shipment</a></p>` : ''}
        <p><strong>Estimated Pickup:</strong> ${details.estimatedPickupAt || '-'}</p>
        <p><strong>Estimated Delivery:</strong> ${details.estimatedDeliveryAt || '-'}</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, shipment for order ${details.orderReference} has been scheduled.`,
  });
}

export async function sendIntegratedPickupEmail(
  to: string,
  firstName: string,
  details: {
    orderReference: string;
    providerName: string;
    trackingId: string | null;
    trackingUrl: string | null;
  },
): Promise<void> {
  await sendEmail({
    to,
    subject: `Shipment picked up - ${details.orderReference}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>${details.providerName} has picked up your shipment.</p>
        <p><strong>Order Reference:</strong> ${details.orderReference}</p>
        <p><strong>Tracking ID:</strong> ${details.trackingId || '-'}</p>
        ${details.trackingUrl ? `<p><a href="${details.trackingUrl}">Track shipment</a></p>` : ''}
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, shipment for order ${details.orderReference} has been picked up.`,
  });
}

export async function sendOutForDeliveryEmail(
  to: string,
  firstName: string,
  details: {
    orderReference: string;
    providerName: string;
    trackingId: string | null;
    trackingUrl: string | null;
  },
): Promise<void> {
  await sendEmail({
    to,
    subject: `Shipment out for delivery - ${details.orderReference}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>Your shipment is out for delivery with ${details.providerName}.</p>
        <p><strong>Order Reference:</strong> ${details.orderReference}</p>
        <p><strong>Tracking ID:</strong> ${details.trackingId || '-'}</p>
        ${details.trackingUrl ? `<p><a href="${details.trackingUrl}">Track shipment</a></p>` : ''}
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, shipment for order ${details.orderReference} is out for delivery.`,
  });
}

export async function sendDeliveryFailureEmail(
  to: string,
  firstName: string,
  details: {
    orderReference: string;
    providerName: string;
    trackingId: string | null;
    trackingUrl: string | null;
    failureReason: string | null;
  },
): Promise<void> {
  await sendEmail({
    to,
    subject: `Delivery issue - ${details.orderReference}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>${details.providerName} reported a delivery issue for your shipment.</p>
        <p><strong>Order Reference:</strong> ${details.orderReference}</p>
        <p><strong>Tracking ID:</strong> ${details.trackingId || '-'}</p>
        ${details.failureReason ? `<p><strong>Reason:</strong> ${details.failureReason}</p>` : ''}
        ${details.trackingUrl ? `<p><a href="${details.trackingUrl}">Track shipment</a></p>` : ''}
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, a delivery issue was reported for order ${details.orderReference}.`,
  });
}

export async function sendB2BQuoteAvailableEmail(
  to: string,
  firstName: string,
  details: {
    requestId: string;
    cargoType: string;
    quotesCount: number;
  },
): Promise<void> {
  await sendEmail({
    to,
    subject: 'B2B logistics quote available',
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>Your B2B logistics request has available quote options.</p>
        <p><strong>Request ID:</strong> ${details.requestId}</p>
        <p><strong>Cargo Type:</strong> ${details.cargoType}</p>
        <p><strong>Quotes Available:</strong> ${details.quotesCount}</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, ${details.quotesCount} B2B logistics quote option(s) are available.`,
  });
}

type DirectRFQEmailDetails = {
  rfqReference: string;
  buyerName: string;
  sellerName: string;
  productName: string | null;
  variantDetails?: string | null;
  quantity: number;
  unit: string;
  deliveryMethod: string;
  deliveryAddress: string;
  expectedDeliveryDate?: string | null;
  description?: string | null;
  buyerNotes?: string | null;
  currency?: string | null;
  pricePerUnit?: number | null;
  productsTotal?: number | null;
  logisticsDisplay?: string | null;
  quoteTotal?: number | null;
  validUntil?: Date | null;
  message?: string | null;
  reason?: string | null;
};

export async function sendDirectRFQCreatedEmail(
  to: string,
  firstName: string,
  details: DirectRFQEmailDetails,
): Promise<void> {
  await sendEmail({
    to,
    subject: `New quotation request - ${details.rfqReference}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>You have received a new Request for Quotation on TOFA Marketplace.</p>
        <p><strong>RFQ Reference:</strong> ${details.rfqReference}</p>
        <p><strong>Buyer:</strong> ${details.buyerName}</p>
        <p><strong>Product:</strong> ${details.productName || 'Product'}</p>
        ${details.variantDetails ? `<p><strong>Variant:</strong> ${details.variantDetails}</p>` : ''}
        <p><strong>Requested Quantity:</strong> ${details.quantity} ${details.unit}</p>
        <p><strong>Requested Delivery Date:</strong> ${details.expectedDeliveryDate || '-'}</p>
        <p><strong>Delivery Method:</strong> ${details.deliveryMethod}</p>
        <p><strong>Delivery Location:</strong> ${details.deliveryAddress}</p>
        <p><strong>Buyer Requirement:</strong> ${details.description || '-'}</p>
        ${details.buyerNotes ? `<p><strong>Additional Notes:</strong> ${details.buyerNotes}</p>` : ''}
        <p>Please review the request and submit your quotation.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, you have received RFQ ${details.rfqReference}.`,
  });
}

export async function sendDirectRFQQuoteReceivedEmail(
  to: string,
  firstName: string,
  details: DirectRFQEmailDetails,
): Promise<void> {
  await sendEmail({
    to,
    subject: `Quotation received - ${details.rfqReference}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>${details.sellerName} has submitted a quotation for your Direct RFQ.</p>
        ${renderDirectRFQTerms(details)}
        <p>Please review the quotation before it expires.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, quotation received for RFQ ${details.rfqReference}.`,
  });
}

export async function sendDirectRFQCounterOfferEmail(
  to: string,
  firstName: string,
  details: DirectRFQEmailDetails,
): Promise<void> {
  await sendEmail({
    to,
    subject: `New counter-offer - ${details.rfqReference}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>A new counter-offer has been submitted for your RFQ.</p>
        ${renderDirectRFQTerms(details)}
        ${details.message ? `<p><strong>Message:</strong> ${details.message}</p>` : ''}
        <p>Please review the updated terms.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, a counter-offer was submitted for RFQ ${details.rfqReference}.`,
  });
}

export async function sendDirectRFQQuoteAcceptedEmail(
  to: string,
  firstName: string,
  details: DirectRFQEmailDetails,
): Promise<void> {
  await sendEmail({
    to,
    subject: `Your quotation has been accepted - ${details.rfqReference}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>${details.buyerName} has accepted your quotation for the following Direct RFQ.</p>
        ${renderDirectRFQTerms(details)}
        <p>The buyer will now proceed through the applicable Checkout and Payment process.</p>
        <p>You will receive an Order notification once the transaction becomes eligible for fulfillment.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, your quotation for RFQ ${details.rfqReference} was accepted.`,
  });
}

export async function sendDirectRFQQuoteRejectedEmail(
  to: string,
  firstName: string,
  details: DirectRFQEmailDetails,
): Promise<void> {
  await sendEmail({
    to,
    subject: `Quotation update - ${details.rfqReference}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>The buyer has declined your current quotation.</p>
        <p><strong>RFQ Reference:</strong> ${details.rfqReference}</p>
        <p><strong>Product:</strong> ${details.productName || 'Product'}</p>
        <p><strong>Reason:</strong> ${details.reason || '-'}</p>
        <p>Where the RFQ remains eligible for further discussion, you may submit revised terms.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, quotation for RFQ ${details.rfqReference} was rejected.`,
  });
}

export async function sendDirectRFQCancelledEmail(
  to: string,
  firstName: string,
  details: DirectRFQEmailDetails,
): Promise<void> {
  await sendEmail({
    to,
    subject: `RFQ cancelled - ${details.rfqReference}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>The buyer has cancelled the following Direct RFQ.</p>
        <p><strong>RFQ Reference:</strong> ${details.rfqReference}</p>
        <p><strong>Product:</strong> ${details.productName || 'Product'}</p>
        <p><strong>Reason:</strong> ${details.reason || '-'}</p>
        <p>No further action is required for this RFQ.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, RFQ ${details.rfqReference} was cancelled.`,
  });
}

type MarketRFQEmailDetails = {
  rfqReference: string;
  buyerName: string;
  sellerName?: string | null;
  requirementTitle: string | null;
  quantity: number;
  unit: string;
  deliveryMethod: string;
  deliveryAddress: string;
  submissionDeadline?: Date | null;
  expectedDeliveryDate?: string | null;
  description?: string | null;
  buyerNotes?: string | null;
  currency?: string | null;
  pricePerUnit?: number | null;
  productsTotal?: number | null;
  logisticsDisplay?: string | null;
  quoteTotal?: number | null;
  validUntil?: Date | null;
  message?: string | null;
  reason?: string | null;
};

export async function sendMarketRFQCreatedEmail(
  to: string,
  firstName: string,
  details: MarketRFQEmailDetails,
): Promise<void> {
  await sendEmail({
    to,
    subject: `New Market RFQ available - ${details.rfqReference}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>A new sourcing requirement matching your business is available on TOFA Marketplace.</p>
        <p><strong>RFQ Reference:</strong> ${details.rfqReference}</p>
        <p><strong>Requirement:</strong> ${details.requirementTitle || 'Buyer requirement'}</p>
        <p><strong>Quantity:</strong> ${details.quantity} ${details.unit}</p>
        <p><strong>Delivery Location:</strong> ${details.deliveryAddress}</p>
        <p><strong>Delivery Method:</strong> ${details.deliveryMethod}</p>
        <p><strong>Quotation Deadline:</strong> ${details.submissionDeadline || '-'}</p>
        <p><strong>Buyer Requirement:</strong> ${details.description || '-'}</p>
        <p>If you can supply the requested goods, please review the RFQ and submit your quotation before the deadline.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, new Market RFQ ${details.rfqReference} is available.`,
  });
}

export async function sendMarketRFQQuoteReceivedEmail(
  to: string,
  firstName: string,
  details: MarketRFQEmailDetails,
): Promise<void> {
  await sendEmail({
    to,
    subject: `New quotation received - ${details.rfqReference}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>${details.sellerName || 'A seller'} has submitted a quotation for your Market RFQ.</p>
        ${renderMarketRFQTerms(details)}
        ${details.message ? `<p><strong>Seller Message:</strong> ${details.message}</p>` : ''}
        <p>You can compare this quotation with other responses from your RFQ dashboard.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, quotation received for Market RFQ ${details.rfqReference}.`,
  });
}

export async function sendMarketRFQCounterOfferEmail(
  to: string,
  firstName: string,
  details: MarketRFQEmailDetails,
): Promise<void> {
  await sendEmail({
    to,
    subject: `New Market RFQ counter-offer - ${details.rfqReference}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>A new counter-offer has been submitted for your Market RFQ negotiation.</p>
        ${renderMarketRFQTerms(details)}
        ${details.message ? `<p><strong>Message:</strong> ${details.message}</p>` : ''}
        <p>Please review the updated terms.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, a counter-offer was submitted for Market RFQ ${details.rfqReference}.`,
  });
}

export async function sendMarketRFQQuoteAcceptedEmail(
  to: string,
  firstName: string,
  details: MarketRFQEmailDetails,
): Promise<void> {
  await sendEmail({
    to,
    subject: `Your quotation has been accepted - ${details.rfqReference}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>The buyer has selected your quotation for the following Market RFQ.</p>
        ${renderMarketRFQTerms(details)}
        <p>The buyer will now proceed through the applicable Checkout and Payment process.</p>
        <p>An Order will be created only after the transaction reaches the required Payment condition.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, your quotation for Market RFQ ${details.rfqReference} was accepted.`,
  });
}

export async function sendMarketRFQQuoteRejectedEmail(
  to: string,
  firstName: string,
  details: MarketRFQEmailDetails,
): Promise<void> {
  await sendEmail({
    to,
    subject: `Quotation update - ${details.rfqReference}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>The buyer has declined your quotation for this Market RFQ.</p>
        <p><strong>RFQ Reference:</strong> ${details.rfqReference}</p>
        <p><strong>Requirement:</strong> ${details.requirementTitle || 'Buyer requirement'}</p>
        <p><strong>Reason:</strong> ${details.reason || '-'}</p>
        <p>The Market RFQ may remain open to other quotations or further actions depending on its current status.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, quotation for Market RFQ ${details.rfqReference} was declined.`,
  });
}

export async function sendMarketRFQQuoteClosedEmail(
  to: string,
  firstName: string,
  details: MarketRFQEmailDetails,
): Promise<void> {
  await sendEmail({
    to,
    subject: `Market RFQ closed - ${details.rfqReference}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>The following Market RFQ has now been awarded to another supplier.</p>
        <p><strong>RFQ Reference:</strong> ${details.rfqReference}</p>
        <p><strong>Requirement:</strong> ${details.requirementTitle || 'Buyer requirement'}</p>
        <p>Your quotation is now closed and no further action is required.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, Market RFQ ${details.rfqReference} was awarded to another supplier.`,
  });
}

export async function sendMarketRFQCancelledEmail(
  to: string,
  firstName: string,
  details: MarketRFQEmailDetails,
): Promise<void> {
  await sendEmail({
    to,
    subject: `Market RFQ cancelled - ${details.rfqReference}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>The buyer has cancelled the following Market RFQ.</p>
        <p><strong>RFQ Reference:</strong> ${details.rfqReference}</p>
        <p><strong>Requirement:</strong> ${details.requirementTitle || 'Buyer requirement'}</p>
        <p><strong>Reason:</strong> ${details.reason || '-'}</p>
        <p>Any active quotation you submitted for this RFQ has now been closed.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, Market RFQ ${details.rfqReference} was cancelled.`,
  });
}

type SubscriptionEmailDetails = {
  planName: string;
  billingPeriod?: string | null;
  amount?: number | null;
  currency?: string | null;
  startedAt?: Date | null;
  expiresAt?: Date | null;
};

export async function sendSubscriptionActivatedEmail(
  to: string,
  firstName: string,
  details: SubscriptionEmailDetails,
): Promise<void> {
  await sendEmail({
    to,
    subject: `Your ${details.planName} subscription is active`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>Your <strong>${details.planName}</strong> subscription is now active on TOFA Marketplace.</p>
        ${renderSubscriptionDetails(details)}
        <p>Your account entitlements have been updated and will apply across eligible marketplace workflows.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, your ${details.planName} subscription is active.`,
  });
}

export async function sendFreeSubscriptionActivatedEmail(
  to: string,
  firstName: string,
  details: SubscriptionEmailDetails,
): Promise<void> {
  await sendEmail({
    to,
    subject: `Your ${details.planName} plan is active`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>Your free <strong>${details.planName}</strong> plan is now active on TOFA Marketplace.</p>
        ${renderSubscriptionDetails(details)}
        <p>You can continue using the marketplace features included in your plan.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, your free ${details.planName} plan is active.`,
  });
}

export async function sendSubscriptionUpgradeEmail(
  to: string,
  firstName: string,
  details: SubscriptionEmailDetails & { previousPlanName?: string | null },
): Promise<void> {
  await sendEmail({
    to,
    subject: `Subscription updated to ${details.planName}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>Your subscription has been updated${details.previousPlanName ? ` from <strong>${details.previousPlanName}</strong>` : ''} to <strong>${details.planName}</strong>.</p>
        ${renderSubscriptionDetails(details)}
        <p>Your new entitlements are now available across the platform.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, your subscription has been updated to ${details.planName}.`,
  });
}

export async function sendSubscriptionExpiredEmail(
  to: string,
  firstName: string,
  details: SubscriptionEmailDetails,
): Promise<void> {
  await sendEmail({
    to,
    subject: `${details.planName} subscription expired`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>Your <strong>${details.planName}</strong> subscription has expired.</p>
        ${renderSubscriptionDetails(details)}
        <p>Your account will use the currently available default entitlements until you renew or select another plan.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, your ${details.planName} subscription has expired.`,
  });
}

export async function sendSubscriptionExpiryReminderEmail(
  to: string,
  firstName: string,
  details: SubscriptionEmailDetails & { daysRemaining: number },
): Promise<void> {
  await sendEmail({
    to,
    subject: `${details.planName} renews in ${details.daysRemaining} day${details.daysRemaining === 1 ? '' : 's'}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>Your <strong>${details.planName}</strong> subscription expires in ${details.daysRemaining} day${details.daysRemaining === 1 ? '' : 's'}.</p>
        ${renderSubscriptionDetails(details)}
        <p>Please renew before expiry to keep your current entitlements uninterrupted.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, your ${details.planName} subscription expires in ${details.daysRemaining} day${details.daysRemaining === 1 ? '' : 's'}.`,
  });
}

export async function sendReviewSubmittedEmail(
  to: string,
  firstName: string,
  details: {
    reviewType: 'product' | 'seller';
    subjectName: string;
    rating: number;
    pointsAwarded: number;
  },
): Promise<void> {
  await sendEmail({
    to,
    subject: 'Thanks for your review',
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>Thank you for reviewing ${details.subjectName}.</p>
        <p><strong>Rating:</strong> ${details.rating}/5</p>
        ${
          details.pointsAwarded > 0
            ? `<p><strong>Reward Points Earned:</strong> ${details.pointsAwarded}</p>`
            : ''
        }
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, thanks for reviewing ${details.subjectName}.`,
  });
}

export async function sendLowRatingReviewEmail(
  to: string,
  firstName: string,
  details: {
    reviewType: 'product' | 'seller';
    subjectName: string;
    rating: number;
  },
): Promise<void> {
  await sendEmail({
    to,
    subject: 'A low rating review was submitted',
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>A buyer submitted a ${details.rating}/5 review for ${details.subjectName}.</p>
        <p>Please review the feedback in your seller dashboard and respond where appropriate.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, a buyer submitted a ${details.rating}/5 review for ${details.subjectName}.`,
  });
}

export async function sendReviewReminderEmail(
  to: string,
  firstName: string,
  details: {
    orderReference: string;
    expiresAt: Date | null;
  },
): Promise<void> {
  await sendEmail({
    to,
    subject: `Share your order review - ${details.orderReference}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>Your order ${details.orderReference} is ready for review.</p>
        ${
          details.expiresAt
            ? `<p><strong>Review by:</strong> ${details.expiresAt.toISOString()}</p>`
            : ''
        }
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, your order ${details.orderReference} is ready for review.`,
  });
}

export async function sendReviewResponseEmail(
  to: string,
  firstName: string,
  details: {
    reviewType: 'product' | 'seller';
    subjectName: string;
  },
): Promise<void> {
  await sendEmail({
    to,
    subject: 'A seller responded to your review',
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>The seller has responded to your review for ${details.subjectName}.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, the seller responded to your review for ${details.subjectName}.`,
  });
}

export async function sendUnreadMessageEmail(
  to: string,
  firstName: string,
  details: {
    unreadCount: number;
    senderName: string;
  },
): Promise<void> {
  const label = details.unreadCount === 1 ? 'message' : 'messages';
  await sendEmail({
    to,
    subject: `You have unread ${label}`,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <p>You have ${details.unreadCount} unread ${label} from ${details.senderName}.</p>
        <p>Please sign in to your Traders of Africa account to continue the conversation.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, you have ${details.unreadCount} unread ${label} from ${details.senderName}.`,
  });
}

export async function sendSystemAnnouncementEmail(
  to: string,
  firstName: string,
  details: {
    title: string;
    message: string;
    actionUrl?: string | null;
  },
): Promise<void> {
  await sendEmail({
    to,
    subject: details.title,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName || 'there'},</h2>
        <h3>${details.title}</h3>
        <p>${details.message}</p>
        ${
          details.actionUrl
            ? `<p><a href="${details.actionUrl}">${details.actionUrl}</a></p>`
            : ''
        }
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa Team</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName || 'there'}, ${details.title}. ${details.message}${
      details.actionUrl ? ` ${details.actionUrl}` : ''
    }`,
  });
}

function renderOrderItems(order: OrderEmailPayload): string {
  return `
    <h3>Products</h3>
    <ul>
      ${order.items
        .map(
          (item) => `
            <li>
              <strong>${item.productName || 'Product'}</strong><br/>
              ${
                item.attributes
                  ? Object.entries(item.attributes)
                      .map(([key, value]) => `${key}: ${String(value)}`)
                      .join('<br/>')
                  : ''
              }
              <br/>Quantity: ${item.quantity}${item.unit ? ` ${item.unit}` : ''}
              <br/>Unit Price: ${order.orderCurrency} ${item.unitPrice}
              <br/>Subtotal: ${order.orderCurrency} ${item.subtotal}
            </li>
          `,
        )
        .join('')}
    </ul>
  `;
}

function renderPaymentCurrencySection(order: OrderEmailPayload): string {
  if (order.paymentCurrency === order.orderCurrency) return '';
  return `<p><strong>Payment Equivalent:</strong> ${order.paymentCurrency} ${order.paymentAmount}</p>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderDirectRFQTerms(details: DirectRFQEmailDetails): string {
  return `
    <p><strong>RFQ Reference:</strong> ${details.rfqReference}</p>
    <p><strong>Product:</strong> ${details.productName || 'Product'}</p>
    <p><strong>Quantity:</strong> ${details.quantity} ${details.unit}</p>
    ${
      details.pricePerUnit !== undefined && details.pricePerUnit !== null
        ? `<p><strong>Price Per Unit:</strong> ${details.currency} ${details.pricePerUnit}</p>`
        : ''
    }
    ${
      details.productsTotal !== undefined && details.productsTotal !== null
        ? `<p><strong>Products Total:</strong> ${details.currency} ${details.productsTotal}</p>`
        : ''
    }
    ${details.logisticsDisplay ? `<p><strong>Logistics:</strong> ${details.logisticsDisplay}</p>` : ''}
    ${
      details.quoteTotal !== undefined && details.quoteTotal !== null
        ? `<p><strong>Quote Total:</strong> ${details.currency} ${details.quoteTotal}</p>`
        : ''
    }
    <p><strong>Delivery Method:</strong> ${details.deliveryMethod}</p>
    <p><strong>Expected Delivery:</strong> ${details.expectedDeliveryDate || '-'}</p>
    <p><strong>Valid Until:</strong> ${details.validUntil || '-'}</p>
  `;
}

function renderMarketRFQTerms(details: MarketRFQEmailDetails): string {
  return `
    <p><strong>RFQ Reference:</strong> ${details.rfqReference}</p>
    <p><strong>Requirement:</strong> ${details.requirementTitle || 'Buyer requirement'}</p>
    <p><strong>Quantity:</strong> ${details.quantity} ${details.unit}</p>
    ${
      details.pricePerUnit !== undefined && details.pricePerUnit !== null
        ? `<p><strong>Price Per Unit:</strong> ${details.currency} ${details.pricePerUnit}</p>`
        : ''
    }
    ${
      details.productsTotal !== undefined && details.productsTotal !== null
        ? `<p><strong>Products Total:</strong> ${details.currency} ${details.productsTotal}</p>`
        : ''
    }
    ${details.logisticsDisplay ? `<p><strong>Logistics:</strong> ${details.logisticsDisplay}</p>` : ''}
    ${
      details.quoteTotal !== undefined && details.quoteTotal !== null
        ? `<p><strong>Quote Total:</strong> ${details.currency} ${details.quoteTotal}</p>`
        : ''
    }
    <p><strong>Delivery Method:</strong> ${details.deliveryMethod}</p>
    <p><strong>Expected Delivery:</strong> ${details.expectedDeliveryDate || '-'}</p>
    <p><strong>Valid Until:</strong> ${details.validUntil || '-'}</p>
  `;
}

function renderSubscriptionDetails(details: SubscriptionEmailDetails): string {
  return `
    <p><strong>Plan:</strong> ${details.planName}</p>
    ${details.billingPeriod ? `<p><strong>Billing Period:</strong> ${details.billingPeriod}</p>` : ''}
    ${
      details.amount !== undefined && details.amount !== null && details.currency
        ? `<p><strong>Amount:</strong> ${details.currency} ${details.amount}</p>`
        : ''
    }
    ${details.startedAt ? `<p><strong>Started:</strong> ${details.startedAt.toISOString()}</p>` : ''}
    ${details.expiresAt ? `<p><strong>Expires:</strong> ${details.expiresAt.toISOString()}</p>` : ''}
  `;
}

export async function sendSellerApprovalEmail(
  to: string,
  firstName: string,
): Promise<void> {
  await sendEmail({
    to,
    subject: 'Your Business Has Been Verified',
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName},</h2>
        <p>Congratulations! 🎉</p>
        <p>Your business has been successfully verified on <strong>Traders of Africa</strong>.</p>
        <p>You can now:</p>
        <ul>
          <li>Start listing products</li>
          <li>Respond to RFQs</li>
          <li>Trade with buyers across the marketplace</li>
        </ul>
        <p>We wish you great success on the platform.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName}, congratulations! Your business has been verified on Traders of Africa.`,
  });
}

export async function sendSellerRejectionEmail(
  to: string,
  firstName: string,
  reason: string,
): Promise<void> {
  await sendEmail({
    to,
    subject: 'Business Verification Update',
    htmlBody: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2>Hello ${firstName},</h2>
        <p>Thank you for submitting your business verification.</p>
        <p>Unfortunately, we could not approve your verification at this time for the following reason:</p>
        <blockquote style="border-left:4px solid #ccc;padding:12px;margin:16px 0;color:#555;">
          ${reason}
        </blockquote>
        <p>Please update your information and resubmit your verification.</p>
        <br/>
        <p>Best Regards,<br/><strong>Traders of Africa</strong></p>
      </div>
    `,
    textBody: `Hello ${firstName}, your verification was not approved. Reason: ${reason}`,
  });
}
