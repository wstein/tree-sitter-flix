import XCTest
import SwiftTreeSitter
import TreeSitterFlix

final class TreeSitterFlixTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_flix())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading Flix grammar")
    }
}
