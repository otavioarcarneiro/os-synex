-- Registra o instante em que uma fatura foi efetivamente enviada por e-mail.
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS sent_at timestamptz;