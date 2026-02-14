import nbformat

def read_md_cells(path):
    nb = nbformat.read(path, as_version=4)

    return [
        c.source
        for c in nb.cells
        if c.cell_type == "markdown"
    ]

def add_md_cell(path, content):
    nb = nbformat.read(path, as_version=4)

    nb.cells.append(
        nbformat.v4.new_markdown_cell(content)
    )

    nbformat.write(nb, path)
