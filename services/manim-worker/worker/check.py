"""
Static checks on model-written Manim code before it runs.

This is one layer of several (the render also runs as an unprivileged user,
with an empty environment, resource limits and a timeout, in a container that
holds no secrets). It allows only a short list of imports and refuses the
names and attribute tricks Python code uses to reach outside its sandbox.
"""

import ast

MAX_CODE_LENGTH = 40_000

ALLOWED_IMPORTS = {"manim", "numpy", "math", "itertools", "functools", "colorsys", "octo"}

FORBIDDEN_NAMES = {
    "__import__", "eval", "exec", "compile", "open", "input", "globals", "locals", "vars",
    "getattr", "setattr", "delattr", "breakpoint", "help", "exit", "quit", "memoryview",
    "os", "sys", "subprocess", "socket", "shutil", "pathlib", "importlib", "builtins",
    "ctypes", "pickle", "marshal", "urllib", "requests", "http", "threading", "multiprocessing",
}

# Manim classes and numpy functions that read or write files: a scene could
# otherwise copy files from the container into its video, or write new ones.
FORBIDDEN_NAMES |= {"ImageMobject", "SVGMobject", "Code", "VideoMobject", "Paragraph", "config", "tempconfig"}
FORBIDDEN_ATTRIBUTES = {
    "load", "loadtxt", "genfromtxt", "fromfile", "fromregex", "save", "savez", "savez_compressed", "savetxt",
    "tofile", "memmap", "DataSource", "ctypeslib", "lib", "testing", "f2py", "distutils", "system", "popen",
    "file_name", "file_writer", "renderer", "write_to_movie", "save_last_frame",
}

SCENE_BASES = {"OctoScene", "Scene", "MovingCameraScene"}


class CodeRejected(Exception):
    pass


def check_scene_code(code: str, scene_class: str) -> None:
    """Raises CodeRejected with a message the model can act on."""
    if len(code) > MAX_CODE_LENGTH:
        raise CodeRejected(f"Code is longer than {MAX_CODE_LENGTH} characters")
    try:
        tree = ast.parse(code)
    except SyntaxError as error:
        raise CodeRejected(f"SyntaxError on line {error.lineno}: {error.msg}") from None

    found_scene = False
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.split(".")[0] not in ALLOWED_IMPORTS:
                    raise CodeRejected(f"Import of '{alias.name}' isn't allowed; use only {sorted(ALLOWED_IMPORTS)}")
        elif isinstance(node, ast.ImportFrom):
            if (node.module or "").split(".")[0] not in ALLOWED_IMPORTS or node.level:
                raise CodeRejected(f"Import from '{node.module}' isn't allowed; use only {sorted(ALLOWED_IMPORTS)}")
        elif isinstance(node, ast.Name) and node.id in FORBIDDEN_NAMES:
            raise CodeRejected(f"'{node.id}' isn't allowed in scene code")
        elif isinstance(node, ast.Attribute) and node.attr.startswith("__"):
            raise CodeRejected(f"Access to '{node.attr}' isn't allowed in scene code")
        elif isinstance(node, ast.Attribute) and node.attr in FORBIDDEN_ATTRIBUTES:
            raise CodeRejected(f"'.{node.attr}' isn't allowed in scene code (no file access)")
        elif isinstance(node, ast.keyword) and node.arg in {"file_name", "code_file"}:
            raise CodeRejected(f"'{node.arg}=' isn't allowed in scene code (no file access)")
        elif isinstance(node, ast.Constant) and isinstance(node.value, str) and node.value.startswith("__") and node.value.endswith("__"):
            raise CodeRejected("Dunder strings aren't allowed in scene code")
        elif isinstance(node, (ast.Global, ast.Nonlocal, ast.AsyncFunctionDef, ast.Await)):
            raise CodeRejected(f"'{type(node).__name__}' isn't allowed in scene code")
        elif isinstance(node, ast.ClassDef) and node.name == scene_class:
            bases = {b.id for b in node.bases if isinstance(b, ast.Name)}
            if not bases & SCENE_BASES:
                raise CodeRejected(f"class {scene_class} must inherit from OctoScene")
            found_scene = True

    if not found_scene:
        raise CodeRejected(f"Define class {scene_class}(OctoScene) with a construct() method")
