// Tests never read development/production credentials or connect to their databases.
Object.assign(process.env, {
  PAYOUT_PAYSTACK_ENABLED:'false',PAYOUT_PAYSTACK_SECRET_KEY:'',PAYOUT_AUTOMATIC_PROCESSING_ENABLED:'false',SETTLEMENT_WORKER_ENABLED:'false',
  PAYSTACK_REFUNDS_ENABLED: 'false', PAYSTACK_SECRET_KEY: '',
  NODE_ENV: 'test', APP_URL: 'http://localhost', FRONTEND_URL: 'http://localhost',
  DB_HOST: '127.0.0.1', DB_USERNAME: 'root', DB_PASSWORD: 'test-only', DB_NAME: 'after_sales_test', DB_SSL: 'false',
  AZURE_STORAGE_ACCOUNT_NAME: 'teststorageaccount',
  JWT_ACCESS_SECRET: 'test-only-access-secret', JWT_REFRESH_SECRET: 'test-only-refresh-secret',
  POSTMARK_API_TOKEN: 'test-only', POSTMARK_FROM_EMAIL: 'test@example.com', NOTIFICATION_EMAIL_ENABLED: 'false',
});
