"""Platform essentials must not expand the isolated worker's credentials."""
import os
import unittest
from unittest.mock import patch

from app.services import scenario_execution


class ExecutionEnvironmentTests(unittest.TestCase):
    def test_windows_worker_receives_system_root_without_provider_credentials(self):
        with patch.dict(os.environ, {
            'PATH': 'node-fixture-path',
            'SystemRoot': r'C:\Windows',
            'MINIMAX_API_KEY': 'secret-fixture',
            'OPENAI_API_KEY': 'other-secret-fixture',
            'HTTP_PROXY': 'http://private-fixture',
        }, clear=True), patch.object(os, 'name', 'nt'):
            environment = scenario_execution.execution_environment()
        self.assertEqual(environment['SystemRoot'], r'C:\Windows')
        self.assertEqual(environment['PATH'], 'node-fixture-path')
        self.assertEqual(set(environment), {'PATH', 'LANG', 'TMPDIR', 'SystemRoot'})
        self.assertNotIn('secret-fixture', str(environment))

    def test_non_windows_worker_keeps_the_existing_minimal_environment(self):
        with patch.dict(os.environ, {'PATH': '/fixture/bin', 'SystemRoot': 'unused'}, clear=True), patch.object(os, 'name', 'posix'):
            environment = scenario_execution.execution_environment()
        self.assertEqual(environment['PATH'], '/fixture/bin')
        self.assertEqual(environment['LANG'], 'en_US.UTF-8')
        self.assertEqual(set(environment), {'PATH', 'LANG', 'TMPDIR'})


if __name__ == '__main__':
    unittest.main()
