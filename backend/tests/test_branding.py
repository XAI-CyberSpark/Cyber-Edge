import unittest
from app.core.branding import brand_env
from app.core.site_access import site_access_enabled

class BrandingTests(unittest.TestCase):
    def test_old_env_is_preserved(self):
        self.assertEqual(brand_env('OAKEGDE_ACCESS_KEY', env={'CYBEREDGE_ACCESS_KEY':'test-key'}), 'test-key')
        self.assertTrue(site_access_enabled({'CYBEREDGE_SITE_ACCESS':'1'}))
    def test_new_value_wins_even_when_empty(self):
        env={'OAKEGDE_SITE_ACCESS':'', 'CYBEREDGE_SITE_ACCESS':'1'}
        self.assertFalse(site_access_enabled(env))
        self.assertEqual(brand_env('OAKEGDE_ALLOWED_ORIGINS', env={'OAKEGDE_ALLOWED_ORIGINS':'new','CYBEREDGE_ALLOWED_ORIGINS':'old'}),'new')
    def test_default_is_unchanged(self):
        self.assertFalse(site_access_enabled({}))
        self.assertEqual(brand_env('OAKEGDE_CAPABILITY_DB','default',env={}), 'default')
