import json
import os
import subprocess
import sys
import tempfile
from io import StringIO
from pathlib import Path

from django.core.management import call_command
from django.db import connection
from django.test import SimpleTestCase, TestCase

from rest_framework_simplejwt.token_blacklist.models import OutstandingToken


class SmokeInfraTests(SimpleTestCase):
    maxDiff = None

    @staticmethod
    def _run_settings_probe(env_text: str, probe_code: str):
        backend_dir = Path(__file__).resolve().parents[1]
        with tempfile.NamedTemporaryFile('w', suffix='.env', delete=False) as temp_env:
            temp_env.write(env_text)
            temp_env_path = temp_env.name

        env = os.environ.copy()
        env['DJANGO_ENV_FILE'] = temp_env_path
        for key in (
            'SECRET_KEY',
            'DEBUG',
            'DB_NAME',
            'DB_USER',
            'DB_PASSWORD',
            'DB_HOST',
            'DB_PORT',
            'EMAIL_BACKEND',
            'EMAIL_HOST',
            'EMAIL_PORT',
            'EMAIL_USE_TLS',
            'EMAIL_USE_SSL',
            'YOOKASSA_ACCOUNT_ID',
            'YOOKASSA_SECRET_KEY',
            'YOOKASSA_WEBHOOK_ALLOWED_IPS',
            'YOOKASSA_WEBHOOK_TRUST_X_FORWARDED_FOR',
        ):
            env.pop(key, None)

        try:
            return subprocess.run(
                [sys.executable, '-c', probe_code],
                cwd=backend_dir,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )
        finally:
            try:
                os.unlink(temp_env_path)
            except FileNotFoundError:
                pass

    def test_health_endpoint_returns_200(self):
        response = self.client.get('/api/health/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok'})

    def test_cors_allows_local_frontend_origin(self):
        origin = 'http://localhost:3000'
        response = self.client.options(
            '/api/health/',
            HTTP_ORIGIN=origin,
            HTTP_ACCESS_CONTROL_REQUEST_METHOD='GET',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get('access-control-allow-origin'), origin)

    def test_csrf_trusted_origins_include_local_frontend(self):
        from django.conf import settings

        self.assertIn('http://localhost:3000', settings.CSRF_TRUSTED_ORIGINS)
        self.assertIn('http://127.0.0.1:3000', settings.CSRF_TRUSTED_ORIGINS)

    def test_env_missing_required_secret_key_fails_fast(self):
        env_text = '\n'.join(
            [
                'DB_NAME=test_db',
                'DB_USER=test_user',
                'DB_PASSWORD=test_pass',
            ]
        )
        result = self._run_settings_probe(
            env_text=env_text,
            probe_code='from config import settings\nprint(settings.DEBUG)',
        )
        self.assertNotEqual(result.returncode, 0)
        combined_output = f"{result.stdout}\n{result.stderr}"
        self.assertIn('SECRET_KEY', combined_output)
        self.assertIn('not found', combined_output)

    def test_mail_backend_switches_by_env(self):
        base_env = '\n'.join(
            [
                'SECRET_KEY=test-secret-key',
                'DB_NAME=test_db',
                'DB_USER=test_user',
                'DB_PASSWORD=test_pass',
            ]
        )

        console_env = base_env + '\nEMAIL_BACKEND=django.core.mail.backends.console.EmailBackend\n'
        console_result = self._run_settings_probe(
            env_text=console_env,
            probe_code=(
                'from config import settings\n'
                'import json\n'
                'print(json.dumps({"backend": settings.EMAIL_BACKEND}))\n'
            ),
        )
        self.assertEqual(console_result.returncode, 0, msg=console_result.stderr)
        self.assertEqual(
            json.loads(console_result.stdout.strip())['backend'],
            'django.core.mail.backends.console.EmailBackend',
        )

        smtp_env = base_env + '\n' + '\n'.join(
            [
                'EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend',
                'EMAIL_HOST=smtp.gmail.com',
                'EMAIL_PORT=587',
                'EMAIL_USE_TLS=true',
                '',
            ]
        )
        smtp_result = self._run_settings_probe(
            env_text=smtp_env,
            probe_code=(
                'from config import settings\n'
                'import json\n'
                'print(json.dumps({"backend": settings.EMAIL_BACKEND, "host": settings.EMAIL_HOST, "port": settings.EMAIL_PORT, "tls": settings.EMAIL_USE_TLS}))\n'
            ),
        )
        self.assertEqual(smtp_result.returncode, 0, msg=smtp_result.stderr)
        smtp_payload = json.loads(smtp_result.stdout.strip())
        self.assertEqual(smtp_payload['backend'], 'django.core.mail.backends.smtp.EmailBackend')
        self.assertEqual(smtp_payload['host'], 'smtp.gmail.com')
        self.assertEqual(smtp_payload['port'], 587)
        self.assertTrue(smtp_payload['tls'])

    def test_yookassa_env_values_are_read_correctly(self):
        env_text = '\n'.join(
            [
                'SECRET_KEY=test-secret-key',
                'DB_NAME=test_db',
                'DB_USER=test_user',
                'DB_PASSWORD=test_pass',
                'YOOKASSA_ACCOUNT_ID=account-1',
                'YOOKASSA_SECRET_KEY=secret-1',
                'YOOKASSA_WEBHOOK_ALLOWED_IPS=185.71.76.0/27,77.75.156.11',
                'YOOKASSA_WEBHOOK_TRUST_X_FORWARDED_FOR=true',
            ]
        )
        result = self._run_settings_probe(
            env_text=env_text,
            probe_code=(
                'from config import settings\n'
                'import json\n'
                'print(json.dumps({'
                '"account_id": settings.YOOKASSA_ACCOUNT_ID,'
                '"secret_key": settings.YOOKASSA_SECRET_KEY,'
                '"pool_size": len(settings.YOOKASSA_WEBHOOK_ALLOWED_IPS),'
                '"trust_xff": settings.YOOKASSA_WEBHOOK_TRUST_X_FORWARDED_FOR'
                '}))\n'
            ),
        )
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        payload = json.loads(result.stdout.strip())
        self.assertEqual(payload['account_id'], 'account-1')
        self.assertEqual(payload['secret_key'], 'secret-1')
        self.assertEqual(payload['pool_size'], 2)
        self.assertTrue(payload['trust_xff'])


class SmokeInfraDatabaseTests(TestCase):
    def test_system_check_runs_without_errors(self):
        out = StringIO()
        call_command('check', stdout=out, stderr=out)

    def test_jwt_blacklist_table_is_available(self):
        table_names = set(connection.introspection.table_names())
        self.assertIn('token_blacklist_outstandingtoken', table_names)
        OutstandingToken.objects.count()
